"""Readable names for HS4 product codes, provinces and states.

Census short descriptions are upper-case and truncated ("CRUDE OIL FROM PETROLEUM AND
BITUMINOUS MINERA"), so common products get a hand-written name; everything else is
tidied automatically.
"""

from __future__ import annotations

import re

PROVINCE_NAMES = {
    "BC": "British Columbia", "AB": "Alberta", "SK": "Saskatchewan", "MB": "Manitoba", "ON": "Ontario",
    "QC": "Quebec", "NB": "New Brunswick", "NS": "Nova Scotia", "PE": "Prince Edward Island",
    "NL": "Newfoundland and Labrador", "NF": "Newfoundland and Labrador", "YT": "Yukon",
    "NT": "Northwest Territories", "NU": "Nunavut",
}

STATE_NAMES = {
    "AL": "Alabama", "AK": "Alaska", "AZ": "Arizona", "AR": "Arkansas", "CA": "California", "CO": "Colorado",
    "CT": "Connecticut", "DE": "Delaware", "DC": "District of Columbia", "FL": "Florida", "GA": "Georgia",
    "HI": "Hawaii", "ID": "Idaho", "IL": "Illinois", "IN": "Indiana", "IA": "Iowa", "KS": "Kansas",
    "KY": "Kentucky", "LA": "Louisiana", "ME": "Maine", "MD": "Maryland", "MA": "Massachusetts",
    "MI": "Michigan", "MN": "Minnesota", "MS": "Mississippi", "MO": "Missouri", "MT": "Montana",
    "NE": "Nebraska", "NV": "Nevada", "NH": "New Hampshire", "NJ": "New Jersey", "NM": "New Mexico",
    "NY": "New York", "NC": "North Carolina", "ND": "North Dakota", "OH": "Ohio", "OK": "Oklahoma",
    "OR": "Oregon", "PA": "Pennsylvania", "RI": "Rhode Island", "SC": "South Carolina", "SD": "South Dakota",
    "TN": "Tennessee", "TX": "Texas", "UT": "Utah", "VT": "Vermont", "VA": "Virginia", "WA": "Washington",
    "WV": "West Virginia", "WI": "Wisconsin", "WY": "Wyoming", "PR": "Puerto Rico", "VI": "U.S. Virgin Islands",
}

OVERRIDES = {
    "0102": "Live cattle", "0103": "Live hogs", "0201": "Fresh beef", "0202": "Frozen beef", "0203": "Pork",
    "0207": "Poultry meat", "0302": "Fresh fish", "0303": "Frozen fish", "0304": "Fish fillets",
    "0306": "Crab, lobster & shrimp", "0307": "Oysters, clams & mussels", "0401": "Milk & cream",
    "0402": "Milk powder", "0404": "Whey", "0405": "Butter", "0406": "Cheese", "0701": "Potatoes",
    "0703": "Onions & garlic", "0709": "Fresh vegetables", "0710": "Frozen vegetables",
    "0713": "Dried peas, beans & lentils", "0802": "Nuts", "0806": "Grapes", "0808": "Apples & pears",
    "0809": "Cherries & stone fruit", "0810": "Berries & other fruit", "0811": "Frozen fruit",
    "1001": "Wheat", "1003": "Barley", "1004": "Oats", "1005": "Corn", "1205": "Canola seed",
    "1214": "Hay & forage", "1507": "Soybean oil", "1514": "Canola oil", "1905": "Bakery products",
    "2004": "Frozen potato products", "2008": "Prepared fruit & nuts", "2106": "Food preparations",
    "2202": "Soft drinks & juices", "2203": "Beer", "2204": "Wine", "2208": "Spirits", "2309": "Animal feed",
    "2523": "Cement", "2601": "Iron ore", "2603": "Copper ores", "2608": "Zinc ores", "2616": "Precious metal ores",
    "2701": "Coal", "2709": "Crude oil", "2710": "Refined fuels", "2711": "Natural gas", "2713": "Petroleum coke",
    "2715": "Asphalt & bitumen", "2716": "Electricity", "2804": "Hydrogen & industrial gases", "2814": "Ammonia",
    "2815": "Caustic soda", "2905": "Methanol & alcohols", "3002": "Vaccines & blood products",
    "3004": "Medicines", "3102": "Nitrogen fertilizers", "3104": "Potash", "3105": "Mixed fertilizers",
    "3901": "Polyethylene", "3902": "Polypropylene", "3920": "Plastic sheets & film", "3923": "Plastic packaging",
    "3926": "Plastic articles", "4011": "Tires", "4403": "Logs", "4407": "Softwood lumber",
    "4409": "Wood moulding & flooring", "4410": "Particleboard & OSB", "4411": "Fibreboard", "4412": "Plywood",
    "4418": "Builders’ woodwork", "4703": "Wood pulp", "4801": "Newsprint", "4802": "Printing paper",
    "4804": "Kraft paper", "4810": "Coated paper", "4818": "Tissue paper", "4819": "Cartons & boxes",
    "7102": "Diamonds", "7106": "Silver", "7108": "Gold", "7112": "Precious metal scrap", "7202": "Ferroalloys",
    "7204": "Steel scrap", "7208": "Hot-rolled steel", "7210": "Coated steel", "7304": "Steel pipe",
    "7306": "Steel tubes", "7308": "Steel structures", "7326": "Steel articles", "7403": "Refined copper",
    "7601": "Unwrought aluminum", "7604": "Aluminum bars & profiles", "7606": "Aluminum plate & sheet",
    "7610": "Aluminum structures", "7901": "Unwrought zinc", "8411": "Jet engines & turbines", "8413": "Pumps",
    "8414": "Compressors & fans", "8421": "Filters & centrifuges", "8429": "Bulldozers & excavators",
    "8431": "Machinery parts", "8432": "Farm tillage machinery", "8433": "Harvesting machinery",
    "8471": "Computers", "8473": "Computer parts", "8481": "Valves & taps", "8517": "Phones & network gear",
    "8541": "Semiconductor devices", "8542": "Integrated circuits", "8544": "Wire & cable", "8701": "Tractors",
    "8703": "Cars", "8704": "Trucks", "8708": "Auto parts", "8716": "Trailers", "8802": "Aircraft",
    "8803": "Aircraft parts", "8807": "Aircraft parts", "8901": "Ships", "8903": "Boats & yachts",
    "9018": "Medical instruments", "9027": "Lab instruments", "9401": "Seats", "9403": "Furniture",
    "9503": "Toys", "9504": "Video game consoles & games", "9506": "Sports equipment",
    "8800": "Civilian aircraft, engines & parts", "2607": "Lead ores", "2616": "Precious metal ores",
    "7602": "Aluminum scrap", "7404": "Copper scrap", "0811": "Frozen fruit", "1806": "Chocolate", "9801": "Returned U.S. goods", "9999": "Low-value & confidential shipments",
}

_registry: dict[str, str] = {}

_ABBREV = {
    r"\bNESOI\b": "", r"\bNES\b": "", r"\bPTS\b": "parts", r"\bPT\b": "part", r"\bW/\s*": "with ",
    r"\bMCHN\w*": "machines", r"\bEQUIP\b": "equipment", r"\bPREP\b": "prepared", r"\bVEH\w*": "vehicles",
    r"\bMFG\b": "manufactured", r"\bAPPAR\w*": "apparatus", r"\bACCESS\w*": "accessories",
}


def register_descriptions(codes, descs) -> None:
    for c, d in zip(codes, descs):
        if isinstance(d, str) and d and c not in _registry:
            _registry[c] = d


def _tidy(desc: str) -> str:
    s = desc.upper()
    for pat, rep in _ABBREV.items():
        s = re.sub(pat, rep, s)
    s = re.sub(r"\s+", " ", s).strip(" ,;.-")
    s = s.lower()
    s = s[:1].upper() + s[1:]
    if len(s) > 44:
        s = s[:44].rsplit(" ", 1)[0].rstrip(",;") + "…"
    return s


def product_name(hs4: str) -> str:
    if hs4 in OVERRIDES:
        return OVERRIDES[hs4]
    if hs4 in _registry:
        return _tidy(_registry[hs4])
    return f"HS {hs4} products"
