import { Search, SlidersHorizontal, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { DatePickerField } from "@/components/ui/date-picker-field";
import { categoryConfig } from "./constants";
import type { Category } from "./types";

export type DueDateQuick = "yesterday" | "today" | "tomorrow" | null;
export type NotesFilter = "all" | "with" | "without";
export type SortBy = "dueDate" | "startDate" | "amount" | "name";

interface LoanCategoryChipsProps {
  selectedCategories: Category[];
  counts: Record<string, number>;
  onCategoryClick: (id: Category) => void;
}

export function LoanCategoryChips({ selectedCategories, counts, onCategoryClick }: LoanCategoryChipsProps) {
  return (
    <div className="grid grid-cols-4 gap-2 w-full sm:flex sm:flex-nowrap sm:items-center sm:gap-2 sm:overflow-x-auto sm:scrollbar-hide">
      {categoryConfig.map((cat) => {
        const isActive = selectedCategories.includes(cat.id);
        return (
          <button
            key={cat.id}
            onClick={() => onCategoryClick(cat.id)}
            className={`px-2 py-1.5 sm:px-1 lg:px-2 rounded-full text-[10px] sm:text-[10px] lg:text-xs font-medium transition-all duration-200 border whitespace-nowrap sm:flex-1 sm:basis-0 sm:min-w-0 sm:text-center ${
              isActive
                ? `${cat.activeColor} scale-[1.03] shadow-sm ring-1 ring-offset-1 ring-offset-background ring-current/20`
                : `bg-card ${cat.color} hover:opacity-80`
            }`}
          >
            {cat.label} ({counts[cat.id]})
          </button>
        );
      })}
    </div>
  );
}

interface LoanSearchBarProps {
  search: string;
  setSearch: (v: string) => void;
  showFilters: boolean;
  setShowFilters: (v: boolean) => void;
  hasActiveFilters: boolean;
}

export function LoanSearchBar({ search, setSearch, showFilters, setShowFilters, hasActiveFilters }: LoanSearchBarProps) {
  return (
    <>
      <div className="relative flex-1 min-w-[200px]">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground z-10 pointer-events-none" />
        <Input
          placeholder="Buscar por nome do cliente..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10"
        />
      </div>
      <Button
        variant={showFilters ? "default" : "outline"}
        size="sm"
        onClick={() => setShowFilters(!showFilters)}
        className="gap-1.5"
      >
        <SlidersHorizontal className="h-3.5 w-3.5" />
        Filtros
        {hasActiveFilters && (
          <Badge className="bg-destructive text-destructive-foreground h-4 w-4 p-0 flex items-center justify-center text-[10px] rounded-full">
            !
          </Badge>
        )}
      </Button>
    </>
  );
}

interface LoanQuickDateFiltersProps {
  dueDateQuick: DueDateQuick;
  setDueDateQuick: (v: DueDateQuick) => void;
}

export function LoanQuickDateFilters({ dueDateQuick, setDueDateQuick }: LoanQuickDateFiltersProps) {
  const filters = [
    { id: "yesterday" as const, label: "Ontem" },
    { id: "today" as const, label: "Hoje" },
    { id: "tomorrow" as const, label: "Amanhã" },
  ];
  return (
    <div className="flex w-full bg-muted/60 rounded-xl p-0.5 backdrop-blur-sm border border-border/30">
      {filters.map((f) => (
        <button
          key={f.id}
          onClick={() => setDueDateQuick(dueDateQuick === f.id ? null : f.id)}
          className={`flex-1 flex items-center justify-center px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 ${
            dueDateQuick === f.id ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {f.label}
        </button>
      ))}
    </div>
  );
}

interface LoanAdvancedFiltersProps {
  dateFrom: string;
  setDateFrom: (v: string) => void;
  dateTo: string;
  setDateTo: (v: string) => void;
  dueDateFrom: string;
  setDueDateFrom: (v: string) => void;
  dueDateTo: string;
  setDueDateTo: (v: string) => void;
  amountMin: string;
  setAmountMin: (v: string) => void;
  amountMax: string;
  setAmountMax: (v: string) => void;
  tagFilter: string;
  setTagFilter: (v: string) => void;
  allTags: string[];
  sortBy: SortBy;
  setSortBy: (v: SortBy) => void;
  notesFilter: NotesFilter;
  setNotesFilter: (v: NotesFilter) => void;
}

export function LoanAdvancedFilters({
  dateFrom, setDateFrom,
  dateTo, setDateTo,
  dueDateFrom, setDueDateFrom,
  dueDateTo, setDueDateTo,
  amountMin, setAmountMin,
  amountMax, setAmountMax,
  tagFilter, setTagFilter,
  allTags,
  sortBy, setSortBy,
  notesFilter, setNotesFilter,
}: LoanAdvancedFiltersProps) {
  const clearAll = () => {
    setDateFrom(""); setDateTo("");
    setDueDateFrom(""); setDueDateTo("");
    setAmountMin(""); setAmountMax("");
    setTagFilter(""); setNotesFilter("all"); setSortBy("dueDate");
  };
  return (
    <Card>
      <CardContent className="p-4">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <div>
            <Label className="text-xs text-muted-foreground">Data Saída (De)</Label>
            <DatePickerField value={dateFrom} onChange={(v) => setDateFrom(v)} className="h-8 text-sm" />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Data Saída (Até)</Label>
            <DatePickerField value={dateTo} onChange={(v) => setDateTo(v)} className="h-8 text-sm" />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Vencimento (De)</Label>
            <DatePickerField value={dueDateFrom} onChange={(v) => setDueDateFrom(v)} className="h-8 text-sm" />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Vencimento (Até)</Label>
            <DatePickerField value={dueDateTo} onChange={(v) => setDueDateTo(v)} className="h-8 text-sm" />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Valor Mínimo (R$)</Label>
            <Input type="number" step="0.01" placeholder="0" value={amountMin} onChange={(e) => setAmountMin(e.target.value)} className="h-8 text-sm" />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Valor Máximo (R$)</Label>
            <Input type="number" step="0.01" placeholder="∞" value={amountMax} onChange={(e) => setAmountMax(e.target.value)} className="h-8 text-sm" />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Etiqueta</Label>
            <select
              value={tagFilter}
              onChange={(e) => setTagFilter(e.target.value)}
              className="flex h-8 w-full rounded-md border border-input bg-background px-3 py-1 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="">Todas</option>
              {allTags.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Ordenar por</Label>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortBy)}
              className="flex h-8 w-full rounded-md border border-input bg-background px-3 py-1 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="dueDate">Vencimento</option>
              <option value="startDate">Data de Saída</option>
              <option value="amount">Valor</option>
              <option value="name">Nome</option>
            </select>
          </div>
          <div className="col-span-2 sm:col-span-3 lg:col-span-2 flex items-end">
            <select
              value={notesFilter}
              onChange={(e) => setNotesFilter(e.target.value as NotesFilter)}
              className="flex h-8 w-full rounded-md border border-input bg-background px-3 py-1 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="all">Observação: todos</option>
              <option value="with">Apenas com observação</option>
              <option value="without">Apenas sem observação</option>
            </select>
          </div>
        </div>
        <div className="flex justify-end mt-3">
          <Button variant="ghost" size="sm" className="text-xs" onClick={clearAll}>
            <X className="h-3 w-3 mr-1" />Limpar filtros
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
