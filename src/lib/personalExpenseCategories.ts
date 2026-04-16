import {
  Home, UtensilsCrossed, Car, HeartPulse, GraduationCap, Gamepad2,
  ShoppingBag, Receipt, CreditCard, Repeat, PawPrint, Gift, Package,
  type LucideIcon,
} from "lucide-react";

export interface PersonalCategory {
  name: string;
  icon: LucideIcon;
  /** HSL color string (e.g. "210 80% 55%") — kept token-friendly */
  color: string;
}

export const personalCategories: PersonalCategory[] = [
  { name: "Moradia",         icon: Home,            color: "210 80% 55%" },
  { name: "Alimentação",     icon: UtensilsCrossed, color: "25 85% 55%" },
  { name: "Transporte",      icon: Car,             color: "200 70% 50%" },
  { name: "Saúde",           icon: HeartPulse,      color: "0 75% 60%" },
  { name: "Educação",        icon: GraduationCap,   color: "260 70% 60%" },
  { name: "Lazer",           icon: Gamepad2,        color: "290 70% 60%" },
  { name: "Compras",         icon: ShoppingBag,     color: "330 75% 60%" },
  { name: "Contas",          icon: Receipt,         color: "45 90% 55%" },
  { name: "Cartão de Crédito", icon: CreditCard,    color: "230 70% 60%" },
  { name: "Assinaturas",     icon: Repeat,          color: "180 65% 50%" },
  { name: "Pets",            icon: PawPrint,        color: "30 75% 55%" },
  { name: "Presentes",       icon: Gift,            color: "340 75% 65%" },
  { name: "Outros",          icon: Package,         color: "215 15% 55%" },
].sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));

export const getPersonalCategory = (name: string): PersonalCategory =>
  personalCategories.find((c) => c.name === name) ?? personalCategories[personalCategories.length - 1];
