import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import logoIconFallback from "@/assets/logo-icon.png";

export type LogoArea = "header" | "auth" | "favicon" | "report";
export type LogoDevice = "desktop" | "tablet" | "mobile";

export type LogoSizes = Record<LogoArea, Record<LogoDevice, number>>;

export interface AppBranding {
  id: string;
  logo_url: string | null;
  sizes: LogoSizes;
  updated_at: string;
}

const DEFAULT_SIZES: LogoSizes = {
  header: { desktop: 40, tablet: 36, mobile: 32 },
  auth: { desktop: 96, tablet: 80, mobile: 64 },
  favicon: { desktop: 64, tablet: 64, mobile: 64 },
  report: { desktop: 80, tablet: 72, mobile: 64 },
};

export const FALLBACK_LOGO = logoIconFallback;

let cache: AppBranding | null = null;
const subscribers = new Set<(b: AppBranding) => void>();

function notify(b: AppBranding) {
  cache = b;
  subscribers.forEach((cb) => cb(b));
}

async function fetchBranding(): Promise<AppBranding> {
  const { data, error } = await supabase
    .from("app_branding" as any)
    .select("id, logo_url, sizes, updated_at")
    .limit(1)
    .maybeSingle();
  if (error || !data) {
    return {
      id: "default",
      logo_url: null,
      sizes: DEFAULT_SIZES,
      updated_at: new Date().toISOString(),
    };
  }
  const row = data as any;
  return {
    id: row.id,
    logo_url: row.logo_url,
    sizes: { ...DEFAULT_SIZES, ...(row.sizes ?? {}) } as LogoSizes,
    updated_at: row.updated_at,
  };
}

export function useAppBranding() {
  const [branding, setBranding] = useState<AppBranding>(
    cache ?? { id: "loading", logo_url: null, sizes: DEFAULT_SIZES, updated_at: "" }
  );
  const [loading, setLoading] = useState(!cache);

  useEffect(() => {
    let alive = true;
    if (!cache) {
      fetchBranding().then((b) => {
        if (!alive) return;
        notify(b);
        setBranding(b);
        setLoading(false);
      });
    }
    const sub = (b: AppBranding) => setBranding(b);
    subscribers.add(sub);
    return () => {
      alive = false;
      subscribers.delete(sub);
    };
  }, []);

  const refresh = useCallback(async () => {
    const b = await fetchBranding();
    notify(b);
  }, []);

  const saveSizes = useCallback(async (sizes: LogoSizes) => {
    const { data, error } = await supabase
      .from("app_branding" as any)
      .update({ sizes } as any)
      .eq("singleton", true)
      .select("id, logo_url, sizes, updated_at")
      .single();
    if (error) throw error;
    const row = data as any;
    notify({
      id: row.id,
      logo_url: row.logo_url,
      sizes: { ...DEFAULT_SIZES, ...(row.sizes ?? {}) } as LogoSizes,
      updated_at: row.updated_at,
    });
  }, []);

  const uploadLogo = useCallback(async (file: File) => {
    const ext = file.name.split(".").pop()?.toLowerCase() || "png";
    const path = `logo-${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage
      .from("branding")
      .upload(path, file, { upsert: true, contentType: file.type });
    if (upErr) throw upErr;
    const { data: pub } = supabase.storage.from("branding").getPublicUrl(path);
    const url = `${pub.publicUrl}?v=${Date.now()}`;
    const { data, error } = await supabase
      .from("app_branding" as any)
      .update({ logo_url: url } as any)
      .eq("singleton", true)
      .select("id, logo_url, sizes, updated_at")
      .single();
    if (error) throw error;
    const row = data as any;
    notify({
      id: row.id,
      logo_url: row.logo_url,
      sizes: { ...DEFAULT_SIZES, ...(row.sizes ?? {}) } as LogoSizes,
      updated_at: row.updated_at,
    });
  }, []);

  const removeLogo = useCallback(async () => {
    const { data, error } = await supabase
      .from("app_branding" as any)
      .update({ logo_url: null } as any)
      .eq("singleton", true)
      .select("id, logo_url, sizes, updated_at")
      .single();
    if (error) throw error;
    const row = data as any;
    notify({
      id: row.id,
      logo_url: row.logo_url,
      sizes: { ...DEFAULT_SIZES, ...(row.sizes ?? {}) } as LogoSizes,
      updated_at: row.updated_at,
    });
  }, []);

  return { branding, loading, refresh, saveSizes, uploadLogo, removeLogo };
}

export { DEFAULT_SIZES };
