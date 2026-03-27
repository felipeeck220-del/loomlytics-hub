import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useParams, useNavigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { CompanyDataProvider } from "@/contexts/CompanyDataContext";
import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { usePermissions } from "@/hooks/usePermissions";
import Login from "./pages/Login";
import Register from "./pages/Register";
import CompanyLogin from "./pages/CompanyLogin";
import Dashboard from "./pages/Dashboard";
import Machines from "./pages/Machines";
import ClientsArticles from "./pages/ClientsArticles";
import ProductionPage from "./pages/Production";
import Weavers from "./pages/Weavers";
import Reports from "./pages/Reports";
import Outsource from "./pages/Outsource";
import SettingsPage from "./pages/Settings";
import Admin from "./pages/Admin";

import AppLayout from "./components/AppLayout";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

function RootRedirect() {
  const { user, loading } = useAuth();
  const { defaultRoute } = usePermissions();
  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  const target = defaultRoute ? `/${user.company_slug}/${defaultRoute}` : `/${user.company_slug}`;
  return <Navigate to={target} replace />;
}

function ProtectedRoute({ routeKey, children }: { routeKey: string; children: React.ReactNode }) {
  const { canAccess, defaultRoute } = usePermissions();
  const { user } = useAuth();
  if (!canAccess(routeKey)) {
    const fallback = defaultRoute ? `/${user?.company_slug}/${defaultRoute}` : `/${user?.company_slug}`;
    return <Navigate to={fallback} replace />;
  }
  return <>{children}</>;
}

function CompanyRoute() {
  const { user, loading, companies, setActiveCompany } = useAuth();
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const [platformBlocked, setPlatformBlocked] = useState(false);
  const [checkingAccess, setCheckingAccess] = useState(true);
  const [companyResolved, setCompanyResolved] = useState(false);

  // Resolve company from slug
  useEffect(() => {
    if (!user || !slug || !companies.length) return;
    
    const company = companies.find(c => c.company_slug === slug);
    if (!company) {
      // Invalid slug, redirect to user's first company
      navigate(`/${companies[0].company_slug}`, { replace: true });
      return;
    }
    
    if (company.company_id !== user.company_id) {
      // Switch to the company matching the URL slug
      setActiveCompany(company.company_id).then(() => {
        setCompanyResolved(true);
      });
    } else {
      setCompanyResolved(true);
    }
  }, [slug, user?.company_id, companies]);

  // Check platform access
  useEffect(() => {
    if (!user?.company_id || !companyResolved) {
      return;
    }
    (supabase.from as any)('company_settings')
      .select('platform_active')
      .eq('company_id', user.company_id)
      .maybeSingle()
      .then(({ data }: any) => {
        if (data && data.platform_active === false) {
          setPlatformBlocked(true);
        }
        setCheckingAccess(false);
      });
  }, [user?.company_id, companyResolved]);

  if (loading || checkingAccess || !companyResolved) return null;
  if (!user) return <Navigate to="/login" replace />;
  if (platformBlocked) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="text-center space-y-4 max-w-md">
          <div className="mx-auto h-16 w-16 rounded-full bg-destructive/10 flex items-center justify-center">
            <svg className="h-8 w-8 text-destructive" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-foreground">Acesso Bloqueado</h1>
          <p className="text-muted-foreground">O acesso à plataforma foi desativado para sua empresa. Entre em contato com o administrador do sistema.</p>
        </div>
      </div>
    );
  }

  return (
    <CompanyDataProvider>
      <AppLayout />
    </CompanyDataProvider>
  );
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (user) return <Navigate to={`/${user.company_slug}`} replace />;
  return <>{children}</>;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<PublicRoute><Login /></PublicRoute>} />
            <Route path="/register" element={<PublicRoute><Register /></PublicRoute>} />
            <Route path="/:slug/login" element={<CompanyLogin />} />
            <Route path="/:slug" element={<CompanyRoute />}>
              <Route index element={<ProtectedRoute routeKey="dashboard"><Dashboard /></ProtectedRoute>} />
              <Route path="machines" element={<ProtectedRoute routeKey="machines"><Machines /></ProtectedRoute>} />
              <Route path="clients-articles" element={<ProtectedRoute routeKey="clients-articles"><ClientsArticles /></ProtectedRoute>} />
              <Route path="production" element={<ProtectedRoute routeKey="production"><ProductionPage /></ProtectedRoute>} />
              <Route path="outsource" element={<ProtectedRoute routeKey="outsource"><Outsource /></ProtectedRoute>} />
              <Route path="weavers" element={<ProtectedRoute routeKey="weavers"><Weavers /></ProtectedRoute>} />
              <Route path="reports" element={<ProtectedRoute routeKey="reports"><Reports /></ProtectedRoute>} />
              <Route path="settings" element={<ProtectedRoute routeKey="settings"><SettingsPage /></ProtectedRoute>} />
            </Route>
            <Route path="/admin" element={<Admin />} />
            <Route path="/" element={<RootRedirect />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
