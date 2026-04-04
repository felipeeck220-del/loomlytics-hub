import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { ThemeProvider } from "./components/ThemeProvider";

import RootRedirect from "./components/routes/RootRedirect";
import PublicRoute from "./components/routes/PublicRoute";
import CompanyRoute from "./components/routes/CompanyRoute";
import ProtectedRoute from "./components/routes/ProtectedRoute";

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
import AccountsPayable from "./pages/AccountsPayable";
import ResidueSales from "./pages/ResidueSales";
import Invoices from "./pages/Invoices";
import TvCodeEntry from "./pages/TvCodeEntry";
import TvPanel from "./pages/TvPanel";
import Fechamento from "./pages/Fechamento";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

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
                <Route path="contas-pagar" element={<ProtectedRoute routeKey="contas-pagar"><AccountsPayable /></ProtectedRoute>} />
                <Route path="residuos" element={<ProtectedRoute routeKey="residuos"><ResidueSales /></ProtectedRoute>} />
                <Route path="invoices" element={<ProtectedRoute routeKey="invoices"><Invoices /></ProtectedRoute>} />
                <Route path="fechamento" element={<ProtectedRoute routeKey="fechamento"><Fechamento /></ProtectedRoute>} />
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
