import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { Dashboard } from './pages/Dashboard'
import { FactSheet } from './pages/FactSheet'
import { Glossary } from './pages/Glossary'
import { News } from './pages/News'
import { lazy, Suspense } from 'react'

const ProvincialData = lazy(() => import('./pages/ProvincialData').then((m) => ({ default: m.ProvincialData })))

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/factsheet/:jur/:scope" element={<FactSheet />} />
        <Route path="/news" element={<News />} />
        <Route path="/data" element={<Suspense fallback={<p role="status">Loading data explorer…</p>}><ProvincialData /></Suspense>} />
        <Route path="/glossary" element={<Glossary />} />
        <Route path="*" element={<Dashboard />} />
      </Routes>
    </BrowserRouter>
  )
}
