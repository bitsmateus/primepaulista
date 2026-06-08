import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { ApiError } from "@/lib/api";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { InventoryProvider } from "@/contexts/InventoryContext";
import { CRMProvider } from "@/contexts/CRMContext";
import { ServiceOrderProvider } from "@/contexts/ServiceOrderContext";
import LoginPage from "./pages/LoginPage";
import Dashboard from "./pages/Dashboard";
import DevicesPage from "./pages/DevicesPage";
import AccessoriesPage from "./pages/AccessoriesPage";
import PDVPage from "./pages/PDVPage";
import VendasPage from "./pages/VendasPage";
import CustomersPage from "./pages/CustomersPage";
import CRMPage from "./pages/CRMPage";
import AssistenciaPage from "./pages/AssistenciaPage";
import GarantiasPage from "./pages/GarantiasPage";
import BIDashboardPage from "./pages/BIDashboardPage";
import UsersPage from "./pages/UsersPage";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Não repete em sessão expirada (401); demais erros, 1 tentativa
      retry: (failureCount, error) =>
        !(error instanceof ApiError && error.status === 401) && failureCount < 1,
    },
  },
});

// Agrupa os providers de dados que só fazem sentido após o login
function ProtectedApp({
  children,
  adminOnly = false,
}: {
  children: React.ReactNode;
  adminOnly?: boolean;
}) {
  return (
    <ProtectedRoute requireAdmin={adminOnly}>
      <InventoryProvider>
        <CRMProvider>
          <ServiceOrderProvider>{children}</ServiceOrderProvider>
        </CRMProvider>
      </InventoryProvider>
    </ProtectedRoute>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/" element={<ProtectedApp><Dashboard /></ProtectedApp>} />
            <Route path="/pdv" element={<ProtectedApp><PDVPage /></ProtectedApp>} />
            <Route path="/vendas" element={<ProtectedApp><VendasPage /></ProtectedApp>} />
            <Route path="/devices" element={<ProtectedApp><DevicesPage /></ProtectedApp>} />
            <Route path="/accessories" element={<ProtectedApp><AccessoriesPage /></ProtectedApp>} />
            <Route path="/customers" element={<ProtectedApp><CustomersPage /></ProtectedApp>} />
            <Route path="/crm" element={<ProtectedApp><CRMPage /></ProtectedApp>} />
            <Route path="/assistencia" element={<ProtectedApp><AssistenciaPage /></ProtectedApp>} />
            <Route path="/garantias" element={<ProtectedApp><GarantiasPage /></ProtectedApp>} />
            <Route path="/bi" element={<ProtectedApp adminOnly><BIDashboardPage /></ProtectedApp>} />
            <Route path="/usuarios" element={<ProtectedApp adminOnly><UsersPage /></ProtectedApp>} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
