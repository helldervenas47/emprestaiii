export interface Loan {
  id: string;
  borrowerName: string;
  borrowerId?: string;
  amount: number;
  interestRate: number;
  startDate: string;
  dueDate: string;
  installments: number;
  paidInstallments: number;
  status: "active" | "paid" | "overdue";
  notes?: string;
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
  address: string;
  notes?: string;
  createdAt: string;
}
