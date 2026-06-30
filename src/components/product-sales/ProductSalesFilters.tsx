import { Search, LayoutGrid, List, Folder } from "lucide-react";
import { Input } from "@/components/ui/input";
import { SaleCategory, saleCategoryFilters } from "./productSalesTypes";

type ViewMode = "cards" | "list" | "folders";

interface Props {
  view: ViewMode;
  setView: (v: ViewMode) => void;
  categoryFilter: SaleCategory;
  setCategoryFilter: (v: SaleCategory) => void;
  search: string;
  setSearch: (v: string) => void;
  counts: Record<string, number>;
  totalSalesCount: number;
  folderCount: number;
  filteredCount: number;
  totalAmount: number;
  formatCurrency: (v: number) => string;
}

export function ProductSalesFilters({
  view,
  setView,
  categoryFilter,
  setCategoryFilter,
  search,
  setSearch,
  counts,
  totalSalesCount,
  folderCount,
  filteredCount,
  totalAmount,
  formatCurrency,
}: Props) {
  return (
    <>
      {/* View toggle + Category filter pills */}
      <div className="flex items-center gap-2">
        <div className="flex-1 grid grid-cols-3 sm:grid-cols-5 gap-2 w-full">
          {saleCategoryFilters.map((cat) => {
            const count = cat.id === "all" ? totalSalesCount : counts[cat.id] || 0;
            const isActive = categoryFilter === cat.id;
            return (
              <button
                key={cat.id}
                onClick={() => setCategoryFilter(cat.id)}
                className={`px-2 py-1.5 rounded-xl text-[10px] sm:text-xs font-semibold border transition-all duration-200 whitespace-nowrap ${
                  isActive ? cat.activeColor : cat.color
                }`}
              >
                {cat.label} ({count})
              </button>
            );
          })}
        </div>
      </div>

      {/* View toggle */}
      <div className="w-full">
        <div className="bg-muted/50 rounded-xl p-1 flex gap-0.5 w-full">
          <button
            onClick={() => setView("cards")}
            className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all duration-200 ${
              view === "cards" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <LayoutGrid className="h-3.5 w-3.5" />Cards
          </button>
          <button
            onClick={() => setView("list")}
            className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all duration-200 ${
              view === "list" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <List className="h-3.5 w-3.5" />Lista
          </button>
          <button
            onClick={() => setView("folders")}
            className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all duration-200 ${
              view === "folders" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Folder className="h-3.5 w-3.5" />Pastas ({folderCount})
          </button>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 sm:gap-4">
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground z-10 pointer-events-none" />
          <Input placeholder="Buscar..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" />
        </div>
        <div className="text-right shrink-0">
          <p className="text-xs text-muted-foreground">{filteredCount} lançamento(s)</p>
          <p className="text-lg font-bold">{formatCurrency(totalAmount)}</p>
        </div>
      </div>
    </>
  );
}
