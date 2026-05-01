export type InterestModel = "simple" | "compound";
export type CalcMode = "auto" | "manual";

export interface SimulationScenario {
  id: string;
  label?: string;
  amount: number;
  monthlyRate: number; // % ao mês
  installments: number;
  installmentValue: number; // valor da parcela
  interestModel: InterestModel;
  calcMode: CalcMode;
}

export interface LoanSimulation {
  id: string;
  ownerId?: string;
  userId?: string;
  clientId: string | null;
  clientName?: string | null;
  name: string | null;
  notes: string | null;
  scenarios: SimulationScenario[];
  chosenScenarioId: string | null;
  simulationDate: string;
  createdAt: string;
  updatedAt: string;
}

export interface SimulationSettings {
  retentionDays: number;
}

export interface ScenarioComputed extends SimulationScenario {
  totalInterest: number;
  totalPayable: number;
  monthlyInterestValue: number;
}
