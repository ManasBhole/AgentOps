import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import { ThemeProvider } from './context/ThemeContext'
import ProtectedRoute from './components/ProtectedRoute'
import Layout from './components/Layout'
import LandingPage from './pages/LandingPage'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Agents from './pages/Agents'
import Traces from './pages/Traces'
import Incidents from './pages/Incidents'
import Orchestration from './pages/Orchestration'
import Intelligence from './pages/Intelligence'
import Nexus from './pages/Nexus'
import Analytics from './pages/Analytics'
import Playground from './pages/Playground'
import Deployments from './pages/Deployments'
import AuditLog from './pages/AuditLog'
import SLO from './pages/SLO'
import TimeTravelDebugger from './pages/TimeTravelDebugger'
import BlastRadius from './pages/BlastRadius'
import WarRoom from './pages/WarRoom'
import NLQ from './pages/NLQ'
import GenomeDrift from './pages/GenomeDrift'
import ChaosEngineering from './pages/ChaosEngineering'
import FlameGraph from './pages/FlameGraph'
import CostAllocation from './pages/CostAllocation'
import AlertCorrelation from './pages/AlertCorrelation'
import Settings from './pages/Settings'
import PromptManagement from './pages/PromptManagement'
import EvalFramework from './pages/EvalFramework'
import SecurityLayer from './pages/SecurityLayer'
import Register from './pages/Register'
import Integrations from './pages/Integrations'
import ABTesting from './pages/ABTesting'
import RedTeam from './pages/RedTeam'
import AgentComparison from './pages/AgentComparison'
import AlertRules from './pages/AlertRules'
import OAuthCallback from './pages/OAuthCallback'

function HomeRoute() {
  const { isAuthenticated, isLoading } = useAuth()
  if (isLoading) return null
  if (isAuthenticated) return <Navigate to="/agents" replace />
  return <LandingPage />
}

function App() {
  return (
    <BrowserRouter>
      <ThemeProvider>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<HomeRoute />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/oauth/callback" element={<OAuthCallback />} />
          <Route
            path="/*"
            element={
              <ProtectedRoute>
                <Layout>
                  <Routes>
                    <Route path="/" element={<Dashboard />} />
                    <Route path="/agents" element={<Agents />} />
                    <Route path="/traces" element={<Traces />} />
                    <Route path="/incidents" element={<Incidents />} />
                    <Route path="/orchestration" element={<Orchestration />} />
                    <Route path="/intelligence" element={<Intelligence />} />
                    <Route path="/nexus" element={<Nexus />} />
                    <Route path="/analytics" element={<Analytics />} />
                    <Route path="/playground" element={<Playground />} />
                    <Route path="/deployments" element={<Deployments />} />
                    <Route path="/audit" element={<AuditLog />} />
                    <Route path="/slo" element={<SLO />} />
                    <Route path="/timetravel" element={<TimeTravelDebugger />} />
                    <Route path="/blast-radius" element={<BlastRadius />} />
                    <Route path="/warroom/:incidentId" element={<WarRoom />} />
                    <Route path="/nlq" element={<NLQ />} />
                    <Route path="/genome" element={<GenomeDrift />} />
                    <Route path="/chaos" element={<ChaosEngineering />} />
                    <Route path="/flame" element={<FlameGraph />} />
                    <Route path="/cost" element={<CostAllocation />} />
                    <Route path="/alerts" element={<AlertCorrelation />} />
                    <Route path="/settings" element={<Settings />} />
                    <Route path="/prompts" element={<PromptManagement />} />
                    <Route path="/evals" element={<EvalFramework />} />
                    <Route path="/security" element={<SecurityLayer />} />
                    <Route path="/integrations" element={<Integrations />} />
                    <Route path="/redteam" element={<RedTeam />} />
                    <Route path="/abtesting" element={<ABTesting />} />
                    <Route path="/compare" element={<AgentComparison />} />
                    <Route path="/alert-rules" element={<AlertRules />} />
                  </Routes>
                </Layout>
              </ProtectedRoute>
            }
          />
        </Routes>
      </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  )
}

export default App
