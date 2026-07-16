/**
 * LoanList — teste de comportamento leve.
 *
 * `LoanList` orquestra muitos filhos (Summary, Chips, SearchBar, Table, etc.)
 * e depende de hooks pesados (`useLoanListController`, renegotiations,
 * commissions). Mockamos tudo isso e verificamos:
 *   1. Estado vazio quando `loans=[]`.
 *   2. Renderização dos blocos principais com dados fake.
 *   3. Propagação de `search` (busca por cliente) para o controller.
 *   4. Ação nos chips de categoria (filtro por status).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { Loan } from "@/types/loan";

// ---- Mocks dos hooks pesados ----------------------------------------------
vi.mock("@/hooks/useLoanRenegotiations", () => ({
  useLoanRenegotiations: () => ({ renegotiations: [], loading: false }),
}));
vi.mock("@/hooks/useManagerCommissions", () => ({
  useManagerCommissions: () => ({ commissions: [], loading: false }),
}));

// Estado observável do controller — permite validar propagação de props.
const controllerState = {
  search: "",
  setSearch: vi.fn(),
  handleCategoryClick: vi.fn(),
  setView: vi.fn(),
};

vi.mock("@/components/loans/list/useLoanListController", () => ({
  useLoanListController: () => ({
    formatCurrency: (v: number) =>
      new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v),
    view: "cards",
    setView: controllerState.setView,
    search: controllerState.search,
    setSearch: controllerState.setSearch,
    selectedCategories: new Set<string>(),
    handleCategoryClick: controllerState.handleCategoryClick,
    category: "all",
    showFilters: false,
    setShowFilters: vi.fn(),
    dueDateQuick: null,
    setDueDateQuick: vi.fn(),
    dateFrom: "", setDateFrom: vi.fn(),
    dateTo: "", setDateTo: vi.fn(),
    dueDateFrom: "", setDueDateFrom: vi.fn(),
    dueDateTo: "", setDueDateTo: vi.fn(),
    amountMin: "", setAmountMin: vi.fn(),
    amountMax: "", setAmountMax: vi.fn(),
    tagFilter: "", setTagFilter: vi.fn(),
    notesFilter: "all", setNotesFilter: vi.fn(),
    sortBy: "recent", setSortBy: vi.fn(),
    cycleColumnSort: vi.fn(),
    sortIndicator: () => null,
    allTags: [] as string[],
    categorized: [
      {
        id: "loan-1",
        borrowerName: "João Silva",
        amount: 1000,
        interestRate: 5,
        interestType: "simple",
        paymentType: "monthly",
        startDate: "2025-01-01",
        dueDate: "2025-06-01",
        installments: 5,
        paidInstallments: 1,
        status: "active",
        createdAt: "2025-01-01T00:00:00Z",
      } as Loan,
    ],
    counts: { all: 1, active: 1, overdue: 0, paid: 0 },
    summaryData: { totalToReceive: 1050 },
    statusSummary: {
      total: 1050,
      active: 1050,
      overdue: 0,
      paid: 0,
      activeCount: 1,
      overdueCount: 0,
      paidCount: 0,
    },
    grouped: [],
    applyCardFilter: vi.fn(),
  }),
}));

// ---- Mocks dos subcomponentes visuais -------------------------------------
vi.mock("@/components/loans/list/LoanListSummaryCards", () => ({
  LoanListSummaryCards: (props: any) => (
    <div data-testid="summary-cards">Summary: total {props.statusSummary.total}</div>
  ),
}));
vi.mock("@/components/loans/list/LoanListFilters", () => ({
  LoanCategoryChips: (props: any) => (
    <div data-testid="chips">
      <button onClick={() => props.onCategoryClick("active")}>chip:active</button>
      <button onClick={() => props.onCategoryClick("overdue")}>chip:overdue</button>
    </div>
  ),
  LoanSearchBar: (props: any) => (
    <input
      aria-label="Buscar cliente"
      value={props.search}
      onChange={(e) => props.setSearch(e.target.value)}
    />
  ),
  LoanQuickDateFilters: () => <div data-testid="quick-date" />,
  LoanAdvancedFilters: () => <div data-testid="advanced" />,
}));
vi.mock("@/components/loans/list/LoanListMobileCards", () => ({
  LoanListMobileCards: (props: any) => (
    <div data-testid="mobile-cards">
      {props.loans.map((l: Loan) => (
        <div key={l.id}>card:{l.borrowerName}</div>
      ))}
    </div>
  ),
}));
vi.mock("@/components/loans/list/LoanListTable", () => ({
  LoanListTable: () => <div data-testid="table" />,
}));
vi.mock("@/components/loans/list/ClientFolder", () => ({
  ClientFolder: () => <div data-testid="folder" />,
}));

beforeEach(() => {
  controllerState.setSearch.mockClear();
  controllerState.handleCategoryClick.mockClear();
});

import { LoanList } from "@/components/LoanList";

const commonProps = {
  loans: [] as Loan[],
  payments: [],
  installmentSchedules: [],
  onPayment: vi.fn(),
  onPartialPayment: vi.fn(),
  onFullPayment: vi.fn(),
  onInterestPayment: vi.fn(),
  onUpdate: vi.fn(),
  onDelete: vi.fn(),
  onDeletePayment: vi.fn(),
  onSaveSchedule: vi.fn().mockResolvedValue(undefined),
};

describe("LoanList", () => {
  it("renderiza estado vazio quando não há empréstimos", () => {
    render(<LoanList {...commonProps} loans={[]} />);
    expect(screen.getByText(/nenhum empréstimo cadastrado/i)).toBeInTheDocument();
  });

  it("renderiza summary cards, chips, busca e cards quando há empréstimos", () => {
    // 1 empréstimo mock para escapar do early-return.
    const loan: Loan = {
      id: "loan-1",
      borrowerName: "João Silva",
      amount: 1000,
      interestRate: 5,
      interestType: "simple",
      paymentType: "monthly",
      startDate: "2025-01-01",
      dueDate: "2025-06-01",
      installments: 5,
      paidInstallments: 1,
      status: "active",
      createdAt: "2025-01-01T00:00:00Z",
    };
    render(<LoanList {...commonProps} loans={[loan]} />);

    expect(screen.getByTestId("summary-cards")).toBeInTheDocument();
    expect(screen.getByTestId("chips")).toBeInTheDocument();
    expect(screen.getByLabelText(/buscar cliente/i)).toBeInTheDocument();
    // View padrão do mock é "cards" → mobile cards renderizados.
    expect(screen.getByTestId("mobile-cards")).toBeInTheDocument();
    expect(screen.getByText(/card:joão silva/i)).toBeInTheDocument();
  });

  it("propaga a busca por cliente para o controller (setSearch)", () => {
    const loan: Loan = {
      id: "loan-1", borrowerName: "X", amount: 1, interestRate: 1,
      interestType: "simple", paymentType: "monthly",
      startDate: "2025-01-01", dueDate: "2025-06-01",
      installments: 1, paidInstallments: 0, status: "active",
      createdAt: "2025-01-01T00:00:00Z",
    };
    render(<LoanList {...commonProps} loans={[loan]} />);
    fireEvent.change(screen.getByLabelText(/buscar cliente/i), {
      target: { value: "Maria" },
    });
    expect(controllerState.setSearch).toHaveBeenCalledWith("Maria");
  });

  it("propaga o clique em chip de categoria (filtro por status) para o controller", () => {
    const loan: Loan = {
      id: "loan-1", borrowerName: "X", amount: 1, interestRate: 1,
      interestType: "simple", paymentType: "monthly",
      startDate: "2025-01-01", dueDate: "2025-06-01",
      installments: 1, paidInstallments: 0, status: "active",
      createdAt: "2025-01-01T00:00:00Z",
    };
    render(<LoanList {...commonProps} loans={[loan]} />);
    fireEvent.click(screen.getByText("chip:overdue"));
    expect(controllerState.handleCategoryClick).toHaveBeenCalledWith("overdue");
  });
});
