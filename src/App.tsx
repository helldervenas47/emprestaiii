import React, { lazy, Suspense, useEffect, useRef } from "react";
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate, useLocation } from "react-router-dom";
import { AppSonner } from "@/components/ui/app-sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/toaster";
import { useAuth, AuthProvider } from "@/hooks/useAuth";
import { useUserApproval } from "@/hooks/useUserApproval";
import { useNeedsOnboarding } from "@/hooks/useNeedsOnboarding";
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
import ScrollToTop from "./components/ScrollToTop";
import { TrialExpiredGate } from "./components/upgrade/TrialExpiredGate";
import { ReadOnlyModeSync } from "./components/upgrade/ReadOnlyModeSync";

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
const PiggyBankDetail = lazy(() => import("./pages/PiggyBankDetail.tsx"));
const PiggyBanks = lazy(() => import("./pages/PiggyBanks.tsx"));
const Welcome = lazy(() => import("./pages/Welcome.tsx"));

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

function DevQueryLogger() {
  const client = useQueryClient();
  const lastQuerySnapshotRef = useRef<Record<string, string>>({});
  const eventCountRef = useRef<Record<string, number>>({});

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const watchedPrefixes = [
      "loans",
      "payments",
      "loan_installments",
      "expenses",
      "incomes",
      "products",
      "sales",
      "clients",
      "piggy-banks",
      "piggy-bank-ledger",
      "piggy-bank-market-rate",
      "user_roles",
      "user_approvals",
      "profiles",
      "subscriptions",
      "plans",
      "user_owner",
      "account_settings",
      "chart_overrides",
      "user_client_permissions",
      "personal_expense_categories",
    ];

    return client.getQueryCache().subscribe((event) => {
      const query = (event as any)?.query;
      if (!query) return;
      const key = query.queryKey;
      const root = Array.isArray(key) ? String(key[0]) : String(key);
      if (!watchedPrefixes.includes(root)) return;
      const state = query.state;
      const snapshot = JSON.stringify({
        status: state.status,
        fetchStatus: state.fetchStatus,
        isInvalidated: state.isInvalidated,
        dataUpdatedAt: state.dataUpdatedAt,
        errorUpdatedAt: state.errorUpdatedAt,
      });
      const hash = query.queryHash;
      if (lastQuerySnapshotRef.current[hash] === snapshot) return;
      lastQuerySnapshotRef.current[hash] = snapshot;
      eventCountRef.current[hash] = (eventCountRef.current[hash] ?? 0) + 1;
      console.debug("[TanStackQuery event]", {
        count: eventCountRef.current[hash],
        type: (event as any).type,
        actionType: (event as any).action?.type,
        queryKey: key,
        status: state.status,
        fetchStatus: state.fetchStatus,
        isInvalidated: state.isInvalidated,
      });
    });
  }, [client]);

  return null;
}

function DevNetworkLogger() {
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const originalFetch = window.fetch.bind(window);
    const watched = [
      "/rest/v1/cofrinhos",
      "/rest/v1/cofrinho_ledger",
      "/rest/v1/cofrinho_aportes",
      "/rest/v1/cofrinho_eventos",
      "/rest/v1/taxa_referencia",
      "/rest/v1/loans",
      "/rest/v1/payments",
      "/rest/v1/loan_installments",
      "/rest/v1/expenses",
      "/rest/v1/incomes",
      "/rest/v1/products",
      "/rest/v1/sales",
      "/rest/v1/clients",
      "/rest/v1/user_roles",
      "/rest/v1/user_approvals",
      "/rest/v1/profiles",
      "/rest/v1/subscriptions",
      "/rest/v1/plans",
      "/rest/v1/user_owner",
      "/rest/v1/account_settings",
      "/rest/v1/chart_overrides",
      "/rest/v1/user_client_permissions",
      "/rest/v1/personal_expense_categories",
      "/auth/v1/user",
      "/auth/v1/token",
      "/functions/v1/ensure-user-role",
      "get_data_owner_id",
    ];
    const counts: Record<string, number> = {};

    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const startedAt = performance.now();
      const rawUrl = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      const matched = watched.find((part) => rawUrl.includes(part));
      const method = init?.method ?? (typeof input === "object" && "method" in input ? (input as Request).method : "GET");
      let label = matched ?? "";
      if (matched === "get_data_owner_id") label = "/rest/v1/rpc/get_data_owner_id";
      if (matched) {
        counts[label] = (counts[label] ?? 0) + 1;
        console.debug("[Network watch:start]", { count: counts[label], method, resource: label });
      }
      try {
        const response = await originalFetch(input as any, init);
        if (matched) {
          console.debug("[Network watch:end]", {
            count: counts[label],
            method,
            resource: label,
            status: response.status,
            ms: Math.round(performance.now() - startedAt),
          });
        }
        return response;
      } catch (error: any) {
        if (matched) {
          console.debug("[Network watch:error]", {
            count: counts[label],
            method,
            resource: label,
            ms: Math.round(performance.now() - startedAt),
            error: error?.message ?? String(error),
          });
        }
        throw error;
      }
    };

    return () => {
      window.fetch = originalFetch;
    };
  }, []);

  return null;
}

function ProtectedRoute({
  children,
  skipOnboardingCheck = false,
}: {
  children: React.ReactNode;
  skipOnboardingCheck?: boolean;
}) {
  const { user, loading } = useAuth();
  const { status, loading: approvalLoading } = useUserApproval();
  const { needs: needsOnboarding, loading: onboardingLoading } = useNeedsOnboarding();
  const location = useLocation();
  const lastGateLogRef = useRef<string>("");
  const renderCountRef = useRef(0);
  renderCountRef.current += 1;

  const gate = loading
    ? "PageLoader:auth.loading"
    : approvalLoading
      ? "PageLoader:approvalLoading"
      : !user
        ? "Navigate:/auth"
        : status === "pending"
          ? "PendingApprovalScreen:pending"
          : status === "rejected"
            ? "PendingApprovalScreen:rejected"
            : !skipOnboardingCheck && onboardingLoading
              ? "PageLoader:onboardingLoading"
              : !skipOnboardingCheck && needsOnboarding
                ? "Navigate:/bem-vindo"
                : "children";

  if (import.meta.env.DEV) {
    console.debug("[ProtectedRoute render]", {
      renderCount: renderCountRef.current,
      pathname: location.pathname,
      search: location.search,
      authLoading: loading,
      approvalLoading,
      onboardingLoading,
      userId: user?.id ?? null,
      approvalStatus: status,
      needsOnboarding,
      skipOnboardingCheck,
      returns: gate,
    });
  }

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const snapshot = JSON.stringify({
      route: `${location.pathname}${location.search}`,
      gate,
      authLoading: loading,
      approvalLoading,
      onboardingLoading,
      approvalStatus: status,
      needsOnboarding,
      skipOnboardingCheck,
      userId: user?.id ?? null,
    });
    if (snapshot === lastGateLogRef.current) return;
    lastGateLogRef.current = snapshot;
    console.debug("[ProtectedRoute gate]", JSON.parse(snapshot));
  }, [
    approvalLoading,
    loading,
    location.pathname,
    location.search,
    needsOnboarding,
    onboardingLoading,
    skipOnboardingCheck,
    status,
    user?.id,
    gate,
  ]);


  if (loading || approvalLoading) return <PageLoader />;
  if (!user) {
    if (import.meta.env.DEV) {
      console.debug("[ProtectedRoute Navigate]", {
        from: `${location.pathname}${location.search}`,
        to: "/auth",
        reason: "no-user",
        authLoading: loading,
        approvalLoading,
        onboardingLoading,
        userId: null,
      });
    }
    return <Navigate to="/auth" replace />;
  }
  if (status === "pending") return <PendingApprovalScreen />;
  if (status === "rejected") return <PendingApprovalScreen rejected />;
  if (!skipOnboardingCheck) {
    if (onboardingLoading) return <PageLoader />;
    if (needsOnboarding) {
      if (import.meta.env.DEV) {
        console.debug("[ProtectedRoute Navigate]", {
          from: `${location.pathname}${location.search}`,
          to: "/bem-vindo",
          reason: "needs-onboarding",
          authLoading: loading,
          approvalLoading,
          onboardingLoading,
          userId: user.id,
        });
      }
      return <Navigate to="/bem-vindo" replace />;
    }
  }
  return (
    <TrialExpiredGate>
      <ReadOnlyModeSync />
      {children}
    </TrialExpiredGate>
  );
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <PageLoader />;
  if (user) {
    if (import.meta.env.DEV) {
      console.debug("[PublicRoute Navigate]", {
        from: `${location.pathname}${location.search}`,
        to: "/",
        reason: "authenticated-user",
        userId: user.id,
      });
    }
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
}

const App = () => (
  <DevCacheErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <DevQueryLogger />
        <DevNetworkLogger />
        <Toaster />
        <AppSonner />
        <PWAInstallPrompt />
        <OfflineBadge />
        <BrowserRouter>
          <ScrollToTop />
          <AuthProvider>
            <PaymentCelebrationProvider>
              <BrandTitleSync />
              <BrandFaviconSync />
              <AppTimezoneSync />
              <StatusBarScrollSync />
              <ViewAsBanner />
              <Suspense fallback={<PageLoader />}>
                <Routes>
                  <Route
                    path="/"
                    element={
                      <ProtectedRoute>
                        <Index />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/auth"
                    element={
                      <PublicRoute>
                        <Auth />
                      </PublicRoute>
                    }
                  />
                  <Route
                    path="/cadastro"
                    element={
                      <PublicRoute>
                        <Cadastro />
                      </PublicRoute>
                    }
                  />
                  <Route path="/planos" element={<Pricing />} />
                  <Route path="/termos" element={<Terms />} />
                  <Route path="/reembolso" element={<RefundPolicy />} />
                  <Route path="/privacidade" element={<PrivacyPolicy />} />
                  <Route path="/reset-password" element={<ResetPassword />} />
                  <Route
                    path="/planejamento-do-dia"
                    element={
                      <ProtectedRoute>
                        <DailyPlanning />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/cofrinhos"
                    element={
                      <ProtectedRoute>
                        <PiggyBanks />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/bem-vindo"
                    element={
                      <ProtectedRoute skipOnboardingCheck>
                        <Welcome />
                      </ProtectedRoute>
                    }
                  />
                  <Route path="/ajuda" element={<Navigate to="/?tab=help" replace />} />
                  <Route
                    path="/cofrinho/:id"
                    element={
                      <ProtectedRoute>
                        <PiggyBankDetail />
                      </ProtectedRoute>
                    }
                  />

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
