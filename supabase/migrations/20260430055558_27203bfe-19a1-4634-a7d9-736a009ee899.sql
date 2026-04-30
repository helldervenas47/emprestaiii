-- 1. Add tracker_device_id to vehicle_registry
ALTER TABLE public.vehicle_registry
  ADD COLUMN IF NOT EXISTS tracker_device_id text;

-- 2. tracking_providers table (one config per owner)
CREATE TABLE IF NOT EXISTS public.tracking_providers (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id uuid NOT NULL,
  provider text NOT NULL CHECK (provider IN ('hapolo', 'traccar', 'custom')),
  base_url text NOT NULL,
  auth_type text NOT NULL DEFAULT 'bearer' CHECK (auth_type IN ('basic', 'bearer')),
  credential_secret_name text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  last_sync_at timestamptz,
  last_sync_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_id)
);

ALTER TABLE public.tracking_providers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner can view tracking provider"
  ON public.tracking_providers FOR SELECT
  USING (owner_id = public.get_data_owner_id(auth.uid()));

CREATE POLICY "owner can insert tracking provider"
  ON public.tracking_providers FOR INSERT
  WITH CHECK (owner_id = public.get_data_owner_id(auth.uid()) AND public.can_write_data(auth.uid()));

CREATE POLICY "owner can update tracking provider"
  ON public.tracking_providers FOR UPDATE
  USING (owner_id = public.get_data_owner_id(auth.uid()) AND public.can_write_data(auth.uid()));

CREATE POLICY "owner can delete tracking provider"
  ON public.tracking_providers FOR DELETE
  USING (owner_id = public.get_data_owner_id(auth.uid()) AND public.can_write_data(auth.uid()));

CREATE TRIGGER update_tracking_providers_updated_at
  BEFORE UPDATE ON public.tracking_providers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. tracking_positions table (latest position per vehicle)
CREATE TABLE IF NOT EXISTS public.tracking_positions (
  vehicle_id uuid NOT NULL PRIMARY KEY REFERENCES public.vehicle_registry(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL,
  latitude double precision NOT NULL,
  longitude double precision NOT NULL,
  speed_kmh numeric,
  ignition boolean,
  address text,
  address_cached_at timestamptz,
  device_time timestamptz NOT NULL,
  online boolean NOT NULL DEFAULT false,
  raw jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tracking_positions_owner ON public.tracking_positions(owner_id);

ALTER TABLE public.tracking_positions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner can view tracking positions"
  ON public.tracking_positions FOR SELECT
  USING (owner_id = public.get_data_owner_id(auth.uid()));

-- writes are service-role only (no policies for insert/update/delete)

ALTER TABLE public.tracking_positions REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.tracking_positions;