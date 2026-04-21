import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { ClientAnalysisEvent, ClientCreditReport, ClientFinancialProfile } from "@/types/loan";

function rowToFinancialProfile(row: any): ClientFinancialProfile {
  return {
    id: row.id,
    ownerId: row.owner_id,
    clientId: row.client_id,
    analysisStatus: row.analysis_status,
    sourceStatus: row.source_status,
    consentGiven: row.consent_given,
    consentedAt: row.consented_at,
    provider: row.provider,
    monthlyIncome: row.monthly_income != null ? Number(row.monthly_income) : null,
    debtLevel: row.debt_level != null ? Number(row.debt_level) : null,
    employmentStability: row.employment_stability,
    industrySector: row.industry_sector,
    bankingRelationship: row.banking_relationship,
    externalScore: row.external_score != null ? Number(row.external_score) : null,
    internalScore: row.internal_score != null ? Number(row.internal_score) : null,
    consolidatedScore: row.consolidated_score != null ? Number(row.consolidated_score) : null,
    riskLevel: row.risk_level,
    positiveFactors: row.positive_factors ?? [],
    negativeFactors: row.negative_factors ?? [],
    lastError: row.last_error,
    fetchedAt: row.fetched_at,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToCreditReport(row: any): ClientCreditReport {
  return {
    id: row.id,
    ownerId: row.owner_id,
    clientId: row.client_id,
    provider: row.provider,
    rawSummary: row.raw_summary ?? {},
    delinquencyHistory: row.delinquency_history ?? [],
    creditHistorySummary: row.credit_history_summary,
    sourceStatus: row.source_status,
    fetchedAt: row.fetched_at,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToEvent(row: any): ClientAnalysisEvent {
  return {
    id: row.id,
    ownerId: row.owner_id,
    clientId: row.client_id,
    eventType: row.event_type,
    status: row.status,
    message: row.message,
    metadata: row.metadata ?? {},
    createdAt: row.created_at,
  };
}

export function useClientFinancialAnalysis(clientId?: string | null) {
  const { user } = useAuth();
  const [profile, setProfile] = useState<ClientFinancialProfile | null>(null);
  const [report, setReport] = useState<ClientCreditReport | null>(null);
  const [events, setEvents] = useState<ClientAnalysisEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const fetchAnalysis = useCallback(async () => {
    if (!user || !clientId) {
      setProfile(null);
      setReport(null);
      setEvents([]);
      return;
    }

    setLoading(true);
    const [profileRes, reportRes, eventsRes] = await Promise.all([
      supabase.from("client_financial_profiles" as any).select("*").eq("client_id", clientId).maybeSingle(),
      supabase.from("client_credit_reports" as any).select("*").eq("client_id", clientId).order("fetched_at", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("client_analysis_events" as any).select("*").eq("client_id", clientId).order("created_at", { ascending: false }).limit(20),
    ]);

    setProfile(profileRes.data ? rowToFinancialProfile(profileRes.data) : null);
    setReport(reportRes.data ? rowToCreditReport(reportRes.data) : null);
    setEvents((eventsRes.data ?? []).map(rowToEvent));
    setLoading(false);
  }, [user, clientId]);

  useEffect(() => { fetchAnalysis(); }, [fetchAnalysis]);

  useEffect(() => {
    if (!user || !clientId) return;
    const channel = supabase
      .channel(`client-analysis-${clientId}`)
      .on("postgres_changes" as any, { event: "*", schema: "public", table: "client_financial_profiles", filter: `client_id=eq.${clientId}` }, fetchAnalysis)
      .on("postgres_changes" as any, { event: "*", schema: "public", table: "client_credit_reports", filter: `client_id=eq.${clientId}` }, fetchAnalysis)
      .on("postgres_changes" as any, { event: "*", schema: "public", table: "client_analysis_events", filter: `client_id=eq.${clientId}` }, fetchAnalysis)
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user, clientId, fetchAnalysis]);

  const requestAnalysis = useCallback(async (params?: { clientId?: string; consentGiven?: boolean; force?: boolean }) => {
    const targetClientId = params?.clientId ?? clientId;
    if (!targetClientId) return { error: new Error("Cliente inválido") };
    setRefreshing(true);
    const response = await supabase.functions.invoke("sync-client-analysis", {
      body: {
        client_id: targetClientId,
        consent_given: params?.consentGiven,
        force: params?.force ?? true,
      },
    });
    setRefreshing(false);
    await fetchAnalysis();
    return response;
  }, [clientId, fetchAnalysis]);

  const statusTone = useMemo(() => {
    switch (profile?.analysisStatus) {
      case "verified": return "success" as const;
      case "unavailable": return "destructive" as const;
      case "stale": return "outline" as const;
      default: return "outline" as const;
    }
  }, [profile?.analysisStatus]);

  return { profile, report, events, loading, refreshing, fetchAnalysis, requestAnalysis, statusTone };
}