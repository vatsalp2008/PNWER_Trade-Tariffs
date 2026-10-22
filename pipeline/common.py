"""Shared helpers for the data pipeline: paths, taxonomy, HTTP with caching, and
reading single files out of large remote ZIPs without downloading them whole."""

from __future__ import annotations

import hashlib
import io
import json
import os
import time
import zipfile
from functools import lru_cache
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "prototype" / "src" / "data"
CACHE_DIR = Path(os.environ.get("PIPELINE_CACHE", ROOT / "pipeline" / ".cache"))
CACHE_DIR.mkdir(parents=True, exist_ok=True)

US_STATES = ["WA", "OR", "ID", "MT", "AK"]
PROVINCES = ["BC", "AB", "SK", "YT", "NT"]
FIRST_YEAR = 2017

SESSION = requests.Session()
SESSION.headers["User-Agent"] = "PNWER-trade-explorer-pipeline (student project)"


def log(msg: str) -> None:
    print(msg, flush=True)


# ---------- taxonomy (shared with the website) ----------

@lru_cache(maxsize=1)
def taxonomy() -> dict:
    return json.loads((DATA_DIR / "sectors.json").read_text())


@lru_cache(maxsize=1)
def _prefix_table() -> list[tuple[str, str]]:
    rows = []
    for sector in taxonomy()["sectors"]:
        for biz in sector["businesses"]:
            rows += [(p, biz["id"]) for p in biz["hs"]]
    # Longest prefix first, so '8411' wins over '84'.
    return sorted(rows, key=lambda r: -len(r[0]))


@lru_cache(maxsize=None)
def business_of(hs: str) -> str:
    """Map an HS code (2+ digits) to its business id."""
    for prefix, biz in _prefix_table():
        if hs.startswith(prefix):
            return biz
    raise KeyError(f"HS code {hs} is not mapped to any business in sectors.json")


@lru_cache(maxsize=1)
def sector_of_business() -> dict[str, str]:
    return {b["id"]: s["id"] for s in taxonomy()["sectors"] for b in s["businesses"]}


def scopes() -> dict[str, list[str]]:
    """Every scope ('all', each sector, each business) -> the businesses it contains."""
    out: dict[str, list[str]] = {"all": [b["id"] for s in taxonomy()["sectors"] for b in s["businesses"]]}
    for s in taxonomy()["sectors"]:
        out[s["id"]] = [b["id"] for b in s["businesses"]]
        for b in s["businesses"]:
            out[b["id"]] = [b["id"]]
    return out


# ---------- HTTP ----------

def get_json(url: str, params: dict | None = None, *, cache: bool = True, retries: int = 4):
    """GET with retries and an on-disk cache (the cache makes local re-runs fast)."""
    key = hashlib.sha1((url + json.dumps(params or {}, sort_keys=True)).encode()).hexdigest()
    path = CACHE_DIR / "http" / f"{key}.json"
    if cache and path.exists():
        return json.loads(path.read_text())
    for attempt in range(retries):
        try:
            r = SESSION.get(url, params=params, timeout=120, allow_redirects=False)
            if r.status_code == 204:
                data = None
            elif r.status_code in (301, 302):
                raise RuntimeError(f"Redirected to {r.headers.get('location')} (bad or missing API key?)")
            else:
                r.raise_for_status()
                data = r.json()
            if cache:
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text(json.dumps(data))
            return data
        except (requests.RequestException, ValueError) as e:
            if attempt == retries - 1:
                raise
            wait = 2 ** attempt * 3
            log(f"  retry in {wait}s after: {e}")
            time.sleep(wait)


# ---------- remote ZIP members via HTTP range requests ----------

class HttpRangeFile(io.RawIOBase):
    """A read-only, seekable file over HTTP using Range requests, so zipfile can
    read the central directory and one member without fetching the whole ZIP."""

    def __init__(self, url: str, block: int = 4 * 1024 * 1024):
        self.url = url
        for attempt in range(4):
            try:
                head = SESSION.head(url, timeout=60, allow_redirects=True)
                head.raise_for_status()
                # During outages StatCan answers 200 with an HTML error page instead of the ZIP.
                if "html" in head.headers.get("Content-Type", "") or "Content-Length" not in head.headers:
                    raise requests.RequestException(f"Not a file (Content-Type {head.headers.get('Content-Type')}): {url}")
                break
            except requests.RequestException:
                if attempt == 3:
                    raise
                time.sleep(5 * 2 ** attempt)
        self.size = int(head.headers["Content-Length"])
        self.pos = 0
        self.block = block
        self._cache: dict[int, bytes] = {}

    def readable(self) -> bool:
        return True

    def seekable(self) -> bool:
        return True

    def tell(self) -> int:
        return self.pos

    def seek(self, offset: int, whence: int = io.SEEK_SET) -> int:
        base = {io.SEEK_SET: 0, io.SEEK_CUR: self.pos, io.SEEK_END: self.size}[whence]
        self.pos = max(0, min(self.size, base + offset))
        return self.pos

    def _block(self, idx: int) -> bytes:
        if idx not in self._cache:
            start = idx * self.block
            end = min(self.size, start + self.block) - 1
            for attempt in range(4):
                try:
                    r = SESSION.get(self.url, headers={"Range": f"bytes={start}-{end}"}, timeout=120)
                    r.raise_for_status()
                    break
                except requests.RequestException:
                    if attempt == 3:
                        raise
                    time.sleep(3 * 2 ** attempt)
            if len(self._cache) > 64:  # keep memory bounded
                self._cache.clear()
            self._cache[idx] = r.content
        return self._cache[idx]

    def read(self, n: int = -1) -> bytes:
        if n is None or n < 0:
            n = self.size - self.pos
        out = bytearray()
        while n > 0 and self.pos < self.size:
            idx, off = divmod(self.pos, self.block)
            chunk = self._block(idx)[off : off + n]
            out += chunk
            self.pos += len(chunk)
            n -= len(chunk)
        return bytes(out)

    def readinto(self, b) -> int:
        data = self.read(len(b))
        b[: len(data)] = data
        return len(data)


def remote_zip(url: str) -> zipfile.ZipFile:
    return zipfile.ZipFile(io.BufferedReader(HttpRangeFile(url), buffer_size=1024 * 1024))


def cached_zip_member(url: str, pattern: str) -> Path:
    """Copy one member (first name containing `pattern`) of a remote ZIP to the cache and return its path."""
    zf = remote_zip(url)
    names = [n for n in zf.namelist() if pattern in n and n.lower().endswith(".csv")]
    if not names:
        raise FileNotFoundError(f"No member matching {pattern!r} in {url}")
    name = names[0]
    info = zf.getinfo(name)
    dest = CACHE_DIR / "cimt" / Path(url).stem / Path(name).name
    if dest.exists() and dest.stat().st_size == info.file_size:
        return dest
    dest.parent.mkdir(parents=True, exist_ok=True)
    log(f"  extracting {name} ({info.compress_size / 1e6:.0f} MB compressed)")
    with zf.open(name) as src, open(dest, "wb") as out:
        while chunk := src.read(8 * 1024 * 1024):
            out.write(chunk)
    return dest
