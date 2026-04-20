import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

export interface InviteCode {
  id: string;
  code: string;
  owner_id: string;
  active: boolean;
  expires_at: string | null;
  uses_count: number;
  max_uses: number | null;
  created_at: string;
}

function generateCode(len = 10) {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

export function useInviteCodes() {
  const { user, role } = useAuth();
  const [codes, setCodes] = useState<InviteCode[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchCodes = useCallback(async () => {
    if (!user || role !== "admin") {
      setCodes([]);
      setLoading(false);
      return;
    }
    const { data } = await (supabase as any)
      .from("invite_codes")
      .select("*")
      .eq("owner_id", user.id)
      .order("created_at", { ascending: false });
    setCodes((data as InviteCode[]) || []);
    setLoading(false);
  }, [user, role]);

  useEffect(() => { fetchCodes(); }, [fetchCodes]);

  const create = useCallback(async (opts?: { expiresInDays?: number; maxUses?: number | null }) => {
    if (!user) return null;
    const code = generateCode();
    const expires_at = opts?.expiresInDays
      ? new Date(Date.now() + opts.expiresInDays * 86400000).toISOString()
      : null;
    const { data, error } = await (supabase as any)
      .from("invite_codes")
      .insert({
        code,
        owner_id: user.id,
        active: true,
        expires_at,
        max_uses: opts?.maxUses ?? null,
      })
      .select()
      .single();
    if (!error) await fetchCodes();
    return data as InviteCode | null;
  }, [user, fetchCodes]);

  const toggleActive = useCallback(async (id: string, active: boolean) => {
    await (supabase as any).from("invite_codes").update({ active }).eq("id", id);
    await fetchCodes();
  }, [fetchCodes]);

  const remove = useCallback(async (id: string) => {
    await (supabase as any).from("invite_codes").delete().eq("id", id);
    await fetchCodes();
  }, [fetchCodes]);

  return { codes, loading, create, toggleActive, remove, refetch: fetchCodes };
}

export async function validateInviteCode(code: string): Promise<{ valid: boolean; owner_id?: string; require_approval?: boolean; reason?: string }> {
  const { data: invite } = await (supabase as any)
    .from("invite_codes")
    .select("owner_id, active, expires_at, uses_count, max_uses")
    .eq("code", code)
    .maybeSingle();

  if (!invite) return { valid: false, reason: "Código não encontrado" };
  if (!invite.active) return { valid: false, reason: "Código desativado" };
  if (invite.expires_at && new Date(invite.expires_at) < new Date()) return { valid: false, reason: "Código expirado" };
  if (invite.max_uses != null && invite.uses_count >= invite.max_uses) return { valid: false, reason: "Código esgotado" };

  const { data: settings } = await (supabase as any)
    .from("account_settings")
    .select("require_approval")
    .eq("owner_id", invite.owner_id)
    .maybeSingle();

  return {
    valid: true,
    owner_id: invite.owner_id,
    require_approval: settings?.require_approval ?? false,
  };
}
