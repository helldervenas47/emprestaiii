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
  notes?: string;
  createdAt: string;
}

export interface Payment {
  id: string;
  loanId: string;
  amount: number;
  date: string;
  installmentNumber: number;
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

export interface Sale {
  id: string;
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  total: number;
  customerName: string;
  date: string;
  notes?: string;
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
