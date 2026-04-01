import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useParams, useNavigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { CompanyDataProvider } from "@/contexts/CompanyDataContext";
import { SubscriptionProvider, useSubscription } from "@/contexts/SubscriptionContext";
import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { usePermissions } from "@/hooks/usePermissions";
import { ThemeProvider } from "./components/ThemeProvider";
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
import RevisionPage from "./pages/Revision";
import MecanicaPage from "./pages/Mecanica";
import Admin from "./pages/Admin";
import Vendas from "./pages/Vendas";
import PaymentSuccess from "./pages/PaymentSuccess";
import TvCodeEntry from "./pages/TvCodeEntry";
import TvPanel from "./pages/TvPanel";

import AppLayout from "./components/AppLayout";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

function RootRedirect() {
  const { user, loading } = useAuth();
  const { defaultRoute } = usePermissions();
  const [checking, setChecking] = useState(true);
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false);

  useEffect(() => {
    if (loading || !user) { setChecking(false); return; }
    supabase.from('platform_admins').select('id').eq('user_id', user.id).maybeSingle()
      .then(({ data }) => {
        setIsPlatformAdmin(!!data);
        setChecking(false);
      });
  }, [user, loading]);

  if (loading || checking) return null;
  if (!user) return <Navigate to="/login" replace />;
  if (isPlatformAdmin) return <Navigate to="/admin" replace />;
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

function CompanyRouteInner() {
  const { user } = useAuth();
  const { fullyBlocked, loading: subLoading } = useSubscription();

  if (subLoading) return null;

  // Non-admin users are fully blocked when subscription is expired
  if (fullyBlocked) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="text-center space-y-4 max-w-md">
          <div className="mx-auto h-16 w-16 rounded-full bg-destructive/10 flex items-center justify-center">
            <svg className="h-8 w-8 text-destructive" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-foreground">Acesso Bloqueado</h1>
          <p className="text-muted-foreground">A assinatura da empresa está inativa. Solicite ao administrador que renove o plano para restaurar o acesso.</p>
        </div>
      </div>
    );
  }

  return <AppLayout />;
}

function CompanyRoute() {
  const { user, loading, companies, setActiveCompany } = useAuth();
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const [companyResolved, setCompanyResolved] = useState(false);

  // Resolve company from slug
  useEffect(() => {
    if (!user || !slug || !companies.length) return;
    
    const company = companies.find(c => c.company_slug === slug);
    if (!company) {
      navigate(`/${companies[0].company_slug}`, { replace: true });
      return;
    }
    
    if (company.company_id !== user.company_id) {
      setActiveCompany(company.company_id).then(() => {
        setCompanyResolved(true);
      });
    } else {
      setCompanyResolved(true);
    }
  }, [slug, user?.company_id, companies]);

  if (loading) return null;
  if (!user) return <Navigate to={`/${slug}/login`} replace />;
  if (!companyResolved) return null;

  return (
    <CompanyDataProvider>
      <SubscriptionProvider>
        <CompanyRouteInner />
      </SubscriptionProvider>
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
  <ThemeProvider>
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<PublicRoute><Login /></PublicRoute>} />
            <Route path="/register" element={<PublicRoute><Register /></PublicRoute>} />
            <Route path="/admin" element={<Admin />} />
            <Route path="/vendas" element={<Vendas />} />
            <Route path="/payment-success" element={<PaymentSuccess />} />
            <Route path="/tela" element={<TvCodeEntry />} />
            <Route path="/tela/painel" element={<TvPanel />} />
            <Route path="/:slug/login" element={<CompanyLogin />} />
            <Route path="/:slug" element={<CompanyRoute />}>
              <Route index element={<ProtectedRoute routeKey="dashboard"><Dashboard /></ProtectedRoute>} />
              <Route path="machines" element={<ProtectedRoute routeKey="machines"><Machines /></ProtectedRoute>} />
              <Route path="clients-articles" element={<ProtectedRoute routeKey="clients-articles"><ClientsArticles /></ProtectedRoute>} />
              <Route path="production" element={<ProtectedRoute routeKey="production"><ProductionPage /></ProtectedRoute>} />
              <Route path="revision" element={<ProtectedRoute routeKey="revision"><RevisionPage /></ProtectedRoute>} />
              <Route path="mecanica" element={<ProtectedRoute routeKey="mecanica"><MecanicaPage /></ProtectedRoute>} />
              <Route path="outsource" element={<ProtectedRoute routeKey="outsource"><Outsource /></ProtectedRoute>} />
              <Route path="weavers" element={<ProtectedRoute routeKey="weavers"><Weavers /></ProtectedRoute>} />
              <Route path="reports" element={<ProtectedRoute routeKey="reports"><Reports /></ProtectedRoute>} />
              <Route path="settings" element={<ProtectedRoute routeKey="settings"><SettingsPage /></ProtectedRoute>} />
            </Route>
            <Route path="/" element={<RootRedirect />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
  </ThemeProvider>
);

export default App;
