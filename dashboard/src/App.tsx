import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import Agents from './pages/Agents'
import Traces from './pages/Traces'
import Incidents from './pages/Incidents'
import Orchestration from './pages/Orchestration'
import Intelligence from './pages/Intelligence'
import Settings from './pages/Settings'

function App() {
  return (
    <BrowserRouter>
      <Layout>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/agents" element={<Agents />} />
          <Route path="/traces" element={<Traces />} />
          <Route path="/incidents" element={<Incidents />} />
          <Route path="/orchestration" element={<Orchestration />} />
          <Route path="/intelligence" element={<Intelligence />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  )
}

export default App
