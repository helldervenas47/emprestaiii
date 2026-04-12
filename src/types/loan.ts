export interface Loan {
  id: string;
  borrowerName: string;
  borrowerId?: string;
  amount: number;
  interestRate: number;
  interestType: string;
  paymentType: string;
  startDate: string;
  dueDate: string;
  installments: number;
  paidInstallments: number;
  status: "active" | "paid" | "overdue";
  remainingAmount?: number;
  customInstallmentValue?: number | null;
  customInterestValue?: number | null;
  tags?: string[];
  notes?: string;
  lateInterestType?: string | null;
  lateInterestValue?: number | null;
  penaltyValue?: number | null;
  createdAt: string;
}

export interface InstallmentSchedule {
  id?: string;
  loanId: string;
  installmentNumber: number;
  dueDate: string;
  amount: number;
}

export interface Payment {
  id: string;
  loanId: string;
  amount: number;
  date: string;
  installmentNumber: number;
  previousDueDate?: string;
}

export interface Client {
  id: string;
  name: string;
  phone: string;
  email: string;
  cpf: string;
  cnpj: string;
  rg: string;
  address: string;
  city: string;
  state: string;
  score: string;
  notes?: string;
  active: boolean;
  createdAt: string;
}

export interface Product {
  id: string;
  name: string;
  description: string;
  price: number;
  stock: number;
  active: boolean;
  createdAt: string;
}

export type BusinessType = "venda" | "streaming" | "aluguel_veiculo";

export type PaymentMode = "fixa" | "recorrente";

export interface Sale {
  id: string;
  productId?: string;
  productName: string;
  description: string;
  quantity: number;
  unitPrice: number;
  cost: number;
  total: number;
  customerName: string;
  date: string;
  notes?: string;
  businessType: BusinessType;
  paymentMode: PaymentMode;
  installments: number;
  paidInstallments: number;
  downPayment: number;
  frequency: string;
  installmentValue?: number | null;
}

export interface Expense {
  id: string;
  description: string;
  amount: number;
  type: "fixa" | "recorrente";
  category: string;
  installments?: number;
  paidInstallments?: number;
  dueDate: string;
  paid: boolean;
  paidDate?: string;
  notes?: string;
  createdAt: string;
}
