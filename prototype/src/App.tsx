import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { Dashboard } from './pages/Dashboard'
import { FactSheet } from './pages/FactSheet'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/factsheet/:jur/:scope" element={<FactSheet />} />
        <Route path="*" element={<Dashboard />} />
      </Routes>
    </BrowserRouter>
  )
}
