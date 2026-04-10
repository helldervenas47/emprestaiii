export interface Loan {
  id: string;
  borrowerName: string;
  amount: number;
  interestRate: number; // monthly %
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
