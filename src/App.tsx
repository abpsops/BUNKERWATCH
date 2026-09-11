import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom"
import DashboardLayout from "@/layouts/DashboardLayout"
import Dashboard from "@/pages/Dashboard/Dashboard"
import Competitors from "@/pages/Competitors/Competitors"
import Barges from "@/pages/Barges/Barges"
import Vessels from "@/pages/Vessels/Vessels"
import STSAnalysis from "@/pages/STSAnalysis/STSAnalysis"
import VesselLookup from "@/pages/VesselLookup/VesselLookup"
import Reports from "@/pages/Reports/Reports"
import Login from "@/pages/Login/Login"
import { useAuth } from "@/hooks/useAuth"
import { isSupabaseConfigured } from "@/services/supabase/client"

export default function App() {
  return (
    <BrowserRouter basename="/BUNKERWATCH/">
      <AuthGate>
        <Routes>
          <Route element={<DashboardLayout />}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/competitors" element={<Competitors />} />
            <Route path="/competitors/:id" element={<Competitors />} />
            <Route path="/barges" element={<Barges />} />
            <Route path="/vessels" element={<Vessels />} />
            <Route path="/sts-analysis" element={<STSAnalysis />} />
            <Route path="/vessel-lookup" element={<VesselLookup />} />
            <Route path="/reports" element={<Reports />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </AuthGate>
    </BrowserRouter>
  )
}

/**
 * Demo mode (no Supabase configured) never requires login — there's
 * nothing behind RLS to protect. Once Supabase is connected, every query
 * runs under Row Level Security scoped to the signed-in user's
 * organization, so an unauthenticated session sees nothing at all; this
 * gate is what makes that visible as "please sign in" instead of a
 * silently empty app.
 */
function AuthGate({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, loading } = useAuth()

  if (!isSupabaseConfigured) return <>{children}</>
  if (loading) return null
  if (!isAuthenticated) return <Login />
  return <>{children}</>
}
