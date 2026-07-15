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
import { AUTH_PATHS } from "./lib/authNavigation";

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

    const debugState = ((window as any).__supabaseLoopDebug ??= {
      invalidations: [] as any[],
    });

    const patchedFlag = "__supabaseInvalidateLoggerPatched";
    if (!(client as any)[patchedFlag]) {
      const originalInvalidateQueries = client.invalidateQueries.bind(client);
      (client as any).invalidateQueries = (...args: Parameters<typeof client.invalidateQueries>) => {
        const stack = new Error("invalidateQueries caller").stack ?? "";
        const entry = {
          at: new Date().toISOString(),
          queryKey: (args[0] as any)?.queryKey ?? null,
          caller: pickAppCaller(stack),
          stack,
        };
        debugState.invalidations.push(entry);
        debugState.invalidations = debugState.invalidations.slice(-50);
        console.warn("[TanStackQuery invalidateQueries]", entry);
        return originalInvalidateQueries(...args);
      };
      (client as any)[patchedFlag] = true;
    }

    return client.getQueryCache().subscribe((event) => {
      const query = (event as any)?.query;
      if (!query) return;
      const key = query.queryKey;
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
        at: new Date().toISOString(),
        count: eventCountRef.current[hash],
        type: (event as any).type,
        actionType: (event as any).action?.type,
        queryKey: key,
        status: state.status,
        fetchStatus: state.fetchStatus,
        isInvalidated: state.isInvalidated,
        observerCount: typeof query.getObserversCount === "function" ? query.getObserversCount() : query.getObservers?.().length,
        lastInvalidations: debugState.invalidations.slice(-5),
      });
    });
  }, [client]);

  return null;
}

function getSupabaseResource(rawUrl: string) {
  try {
    const url = new URL(rawUrl, window.location.origin);
    const path = url.pathname;
    const restIndex = path.indexOf("/rest/v1/");
    if (url.hostname.includes("supabase.co") && restIndex >= 0) {
      const tail = decodeURIComponent(path.slice(restIndex + "/rest/v1/".length));
      const [kind, name] = tail.split("/");
      if (kind === "rpc" && name) return { type: "rpc", resource: `rpc:${name}`, path };
      return { type: "table", resource: kind || "unknown-table", path };
    }
    const functionsIndex = path.indexOf("/functions/v1/");
    if (functionsIndex >= 0) {
      const tail = decodeURIComponent(path.slice(functionsIndex + "/functions/v1/".length));
      return { type: "function", resource: `function:${tail.split("/")[0] || "unknown-function"}`, path };
    }
  } catch {
    // ignore malformed urls
  }
  return null;
}

function pickAppCaller(stack: string) {
  const lines = stack.split("\n").map((line) => line.trim()).filter(Boolean);
  return (
    lines.find((line) => /src\/(hooks|components|pages|lib)\//.test(line) && !line.includes("DevNetworkLogger") && !line.includes("DevQueryLogger"))
    ?? lines.find((line) => line.includes("src/"))
    ?? lines[1]
    ?? "unknown"
  );
}

function shortStack(stack: string) {
  return stack
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 8)
    .join("\n");
}

function DevNetworkLogger() {
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const patchedFlag = "__supabaseFetchLoggerPatched";
    if ((window as any)[patchedFlag]) return;
    (window as any)[patchedFlag] = true;

    const originalFetch = window.fetch.bind(window);
    const debugState = ((window as any).__supabaseLoopDebug ??= {
      invalidations: [] as any[],
    });
    debugState.requests ??= {} as Record<string, any[]>;
    debugState.alerted ??= {} as Record<string, boolean>;

    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const startedAt = performance.now();
      const rawUrl = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      const method = init?.method ?? (typeof input === "object" && "method" in input ? (input as Request).method : "GET");
      const target = getSupabaseResource(rawUrl);
      let requestEntry: any = null;

      if (target) {
        const stack = new Error("Supabase request caller").stack ?? "";
        const now = Date.now();
        const bucket = (debugState.requests[target.resource] ?? []).filter((entry: any) => now - entry.ts <= 10_000);
        requestEntry = {
          ts: now,
          at: new Date(now).toISOString(),
          method,
          resource: target.resource,
          type: target.type,
          caller: pickAppCaller(stack),
          shortStack: shortStack(stack),
          stack,
        };
        bucket.push(requestEntry);
        debugState.requests[target.resource] = bucket;

        console.debug("[Supabase request:start]", {
          timestamp: requestEntry.at,
          method,
          resource: target.resource,
          type: target.type,
          count10s: bucket.length,
          caller: requestEntry.caller,
          stack: requestEntry.shortStack,
        });

        if (bucket.length > 20 && !debugState.alerted[target.resource]) {
          debugState.alerted[target.resource] = true;
          console.error("[Supabase request threshold exceeded]", {
            resource: target.resource,
            type: target.type,
            count10s: bucket.length,
            firstCaller: bucket[0]?.caller,
            latestCaller: requestEntry.caller,
            fullStack: stack,
            last20Callers: bucket.slice(-20).map((entry: any) => ({
              at: entry.at,
              method: entry.method,
              caller: entry.caller,
              shortStack: entry.shortStack,
            })),
            last20Invalidations: (debugState.invalidations ?? []).slice(-20),
          });
        }
      }
      try {
        const response = await originalFetch(input as any, init);
        if (target && requestEntry) {
          console.debug("[Supabase request:end]", {
            timestamp: new Date().toISOString(),
            method,
            resource: target.resource,
            status: response.status,
            ms: Math.round(performance.now() - startedAt),
          });
        }
        return response;
      } catch (error: any) {
        if (target) {
          console.debug("[Supabase request:error]", {
            timestamp: new Date().toISOString(),
            method,
            resource: target.resource,
            ms: Math.round(performance.now() - startedAt),
            error: error?.message ?? String(error),
          });
        }
        throw error;
      }
    };

    return () => {
      window.fetch = originalFetch;
      delete (window as any)[patchedFlag];
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
    return <Navigate to={AUTH_PATHS.login} replace />;
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
                    path={AUTH_PATHS.login}
                    element={
                      <PublicRoute>
                        <Auth />
                      </PublicRoute>
                    }
                  />
                  <Route
                    path={AUTH_PATHS.signup}
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
                  <Route path={AUTH_PATHS.resetPassword} element={<ResetPassword />} />
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
