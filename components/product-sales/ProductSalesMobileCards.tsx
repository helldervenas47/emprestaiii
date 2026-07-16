import { Client, Sale } from "@/types/loan";
import { LocadorInfo } from "@/hooks/useLocadorInfo";
import { VehicleInfo } from "@/hooks/useVehicleRegistry";
import { ProductSaleCard } from "./ProductSaleCard";

export function ProductSalesMobileCards({
  sales,
  formatCurrency,
  readOnly = false,
  clients = [],
  locadorInfo,
  registeredVehicles = [],
  locadores = [],
  onEdit,
  onDeleteSale,
  onUpdateSale,
}: {
  sales: Sale[];
  formatCurrency: (v: number) => string;
  readOnly?: boolean;
  clients?: Client[];
  locadorInfo?: LocadorInfo;
  registeredVehicles?: VehicleInfo[];
  locadores?: LocadorInfo[];
  onEdit: (sale: Sale) => void;
  onDeleteSale: (id: string) => void;
  onUpdateSale: (id: string, data: Partial<Omit<Sale, "id">>) => void;
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {sales.map((sale, i) => (
        <div key={sale.id} className="animate-fade-in" style={{ animationDelay: `${i * 60}ms`, animationFillMode: "backwards" }}>
          <ProductSaleCard
            sale={sale}
            onDelete={() => onDeleteSale(sale.id)}
            onEdit={() => onEdit(sale)}
            onUpdate={(data) => onUpdateSale(sale.id, data)}
            formatCurrency={formatCurrency}
            readOnly={readOnly}
            clients={clients}
            locadorInfo={locadorInfo}
            registeredVehicles={registeredVehicles}
            locadores={locadores}
          />
        </div>
      ))}
    </div>
  );
}
