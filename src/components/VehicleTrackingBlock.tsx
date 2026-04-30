import { useEffect, useMemo } from "react";
import { MapContainer, TileLayer, Marker } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Gauge, KeyRound, MapPin, Clock, Satellite, RefreshCw, Save } from "lucide-react";
import { useState } from "react";
import { TrackingPosition } from "@/hooks/useVehicleTracking";

// Fix Leaflet default icon paths (Vite bundling)
const icon = L.icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});

interface Props {
  vehicleId: string;
  trackerDeviceId: string | null | undefined;
  position?: TrackingPosition;
  readOnly?: boolean;
  onSaveDeviceId: (id: string) => void;
  onRefresh: () => Promise<void> | void;
  providerConfigured: boolean;
}

function formatRelative(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return "agora mesmo";
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h} h`;
  return `há ${Math.floor(h / 24)} d`;
}

export function VehicleTrackingBlock({
  vehicleId, trackerDeviceId, position, readOnly,
  onSaveDeviceId, onRefresh, providerConfigured,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(trackerDeviceId ?? "");
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => { setDraft(trackerDeviceId ?? ""); }, [trackerDeviceId]);

  const center = useMemo<[number, number] | null>(
    () => position ? [position.latitude, position.longitude] : null,
    [position],
  );

  const handleRefresh = async () => {
    setRefreshing(true);
    try { await onRefresh(); } finally { setRefreshing(false); }
  };

  if (!providerConfigured) {
    return (
      <div className="mt-3 pt-3 border-t border-border/50">
        <p className="text-xs text-muted-foreground flex items-center gap-1.5">
          <Satellite className="h-3.5 w-3.5" />
          Configure um provedor de rastreio em Configurações para ativar o monitoramento.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-3 pt-3 border-t border-border/50 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
          <Satellite className="h-3.5 w-3.5" /> Rastreamento
        </span>
        {position && (
          <Badge variant={position.online ? "default" : "secondary"} className={position.online ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/15" : ""}>
            <span className={`h-1.5 w-1.5 rounded-full mr-1.5 ${position.online ? "bg-emerald-500" : "bg-muted-foreground"}`} />
            {position.online ? "Online" : "Offline"}
          </Badge>
        )}
      </div>

      {(!trackerDeviceId || editing) ? (
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <Label className="text-xs">ID do dispositivo</Label>
            <Input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Ex.: IMEI ou ID interno" className="h-8 text-xs" />
          </div>
          <Button size="sm" variant="outline" className="h-8" disabled={readOnly} onClick={() => { onSaveDeviceId(draft.trim()); setEditing(false); }}>
            <Save className="h-3.5 w-3.5 mr-1" /> Salvar
          </Button>
          {trackerDeviceId && (
            <Button size="sm" variant="ghost" className="h-8" onClick={() => { setDraft(trackerDeviceId); setEditing(false); }}>
              Cancelar
            </Button>
          )}
        </div>
      ) : (
        <>
          {center ? (
            <div className="rounded-md overflow-hidden border border-border/50" style={{ height: 140 }}>
              <MapContainer center={center} zoom={15} scrollWheelZoom={false} style={{ height: "100%", width: "100%" }} attributionControl={false}>
                <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                <Marker position={center} icon={icon} />
              </MapContainer>
            </div>
          ) : (
            <div className="rounded-md border border-dashed border-border/50 p-3 text-center">
              <p className="text-xs text-muted-foreground">Aguardando primeira posição…</p>
            </div>
          )}

          {position && (
            <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-muted-foreground">
              {position.speed_kmh != null && (
                <span className="flex items-center gap-1.5"><Gauge className="h-3.5 w-3.5" /> {Math.round(position.speed_kmh)} km/h</span>
              )}
              {position.ignition != null && (
                <span className="flex items-center gap-1.5"><KeyRound className="h-3.5 w-3.5" /> {position.ignition ? "Ligado" : "Desligado"}</span>
              )}
              <span className="flex items-center gap-1.5 col-span-2"><Clock className="h-3.5 w-3.5" /> {formatRelative(position.device_time)}</span>
              {position.address && (
                <span className="flex items-start gap-1.5 col-span-2"><MapPin className="h-3.5 w-3.5 mt-0.5 shrink-0" /> <span className="line-clamp-2">{position.address}</span></span>
              )}
            </div>
          )}

          <div className="flex justify-between items-center pt-1">
            <Button size="sm" variant="ghost" className="h-7 text-xs px-2" onClick={() => setEditing(true)} disabled={readOnly}>
              Trocar ID
            </Button>
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={handleRefresh} disabled={refreshing}>
              <RefreshCw className={`h-3 w-3 mr-1 ${refreshing ? "animate-spin" : ""}`} /> Atualizar
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
