import React, { lazy, Suspense } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { AppSonner } from "@/components/ui/app-sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/toaster";
import { useAuth, AuthProvider } from "@/hooks/useAuth";
import { useUserApproval } from "@/hooks/useUserApproval";
import { PendingApprovalScreen } from "./components/PendingApprovalScreen";
import PWAInstallPrompt from "./components/PWAInstallPrompt";
import { BrandTitleSync } from "./components/BrandTitleSync";
import { BrandFaviconSync } from "./components/BrandFaviconSync";
import { OfflineBadge } from "./components/OfflineBadge";
import { AppTimezoneSync } from "./components/AppTimezoneSync";
import { StatusBarScrollSync } from "./components/StatusBarScrollSync";
import { ViewAsBanner } from "./components/ViewAsBanner";
import { wireAutoSync } from "./lib/offline/sync";
import { DevCacheErrorBoundary } from "./components/DevCacheErrorBoundary";
import { PaymentCelebrationProvider } from "./hooks/usePaymentCelebration";

wireAutoSync();

const Index = lazy(() => import("./pages/Index.tsx"));
const Auth = lazy(() => import("./pages/Auth.tsx"));
const Cadastro = lazy(() => import("./pages/Cadastro.tsx"));
const ResetPassword = lazy(() => import("./pages/ResetPassword.tsx"));
const NotFound = lazy(() => import("./pages/NotFound.tsx"));
const Pricing = lazy(() => import("./pages/Pricing.tsx"));
const Terms = lazy(() => import("./pages/Terms.tsx"));
const RefundPolicy = lazy(() => import("./pages/RefundPolicy.tsx"));
const PrivacyPolicy = lazy(() => import("./pages/PrivacyPolicy.tsx"));
const DailyPlanning = lazy(() => import("./pages/DailyPlanning.tsx"));
const PainelMigracao = lazy(() => import("./pages/PainelMigracao.tsx"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 2,
      gcTime: 1000 * 60 * 10,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

const PageLoader = () => (
  <div className="min-h-screen bg-background flex items-center justify-center">
    <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
  </div>
);

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const { status, loading: approvalLoading } = useUserApproval();
  if (loading || approvalLoading) return <PageLoader />;
  if (!user) return <Navigate to="/auth" replace />;
  if (status === "pending") return <PendingApprovalScreen />;
  if (status === "rejected") return <PendingApprovalScreen rejected />;
  return <>{children}</>;
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <PageLoader />;
  if (user) return <Navigate to="/" replace />;
  return <>{children}</>;
}

const App = () => (
  <DevCacheErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <AppSonner />
        <PWAInstallPrompt />
        <OfflineBadge />
        <BrowserRouter>
          <AuthProvider>
            <PaymentCelebrationProvider>
              <BrandTitleSync />
              <BrandFaviconSync />
              <AppTimezoneSync />
              <StatusBarScrollSync />
              <ViewAsBanner />
              <Suspense fallback={<PageLoader />}>
                <Routes>
                  <Route path="/" element={<ProtectedRoute><Index /></ProtectedRoute>} />
                  <Route path="/auth" element={<PublicRoute><Auth /></PublicRoute>} />
                  <Route path="/cadastro" element={<PublicRoute><Cadastro /></PublicRoute>} />
                  <Route path="/planos" element={<Pricing />} />
                  <Route path="/termos" element={<Terms />} />
                  <Route path="/reembolso" element={<RefundPolicy />} />
                  <Route path="/privacidade" element={<PrivacyPolicy />} />
                  <Route path="/reset-password" element={<ResetPassword />} />
                  <Route path="/planejamento-do-dia" element={<ProtectedRoute><DailyPlanning /></ProtectedRoute>} />
                  <Route path="/painel-migracao" element={<PainelMigracao />} />
                  <Route path="*" element={<NotFound />} />
                </Routes>
              </Suspense>
            </PaymentCelebrationProvider>
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  </DevCacheErrorBoundary>
);

export default App;
