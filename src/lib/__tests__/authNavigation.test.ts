import { describe, expect, it } from "vitest";
import {
  AUTH_PATHS,
  buildSignupPath,
  getPlanSelectionDestination,
} from "@/lib/authNavigation";

describe("authNavigation", () => {
  it("direciona criação de conta sem plano para a rota pública de cadastro", () => {
    expect(buildSignupPath()).toBe("/cadastro");
    expect(buildSignupPath("   ")).toBe("/cadastro");
  });

  it("preserva o plano escolhido ao abrir o cadastro", () => {
    expect(buildSignupPath("Profissional")).toBe("/cadastro?plan=Profissional");
  });

  it("codifica nomes de plano antes de colocá-los na URL", () => {
    expect(buildSignupPath("Plano Anual + IA")).toBe(
      "/cadastro?plan=Plano+Anual+%2B+IA",
    );
  });

  it("mantém login, cadastro e recuperação em rotas distintas", () => {
    expect(AUTH_PATHS.login).not.toBe(AUTH_PATHS.signup);
    expect(AUTH_PATHS.resetPassword).not.toBe(AUTH_PATHS.signup);
  });

  it("envia visitante sem sessão ao cadastro quando ele escolhe um plano", () => {
    expect(getPlanSelectionDestination(false, "Profissional")).toBe(
      "/cadastro?plan=Profissional",
    );
  });

  it("mantém checkout no lugar para usuário já autenticado", () => {
    expect(getPlanSelectionDestination(true, "Profissional")).toBeNull();
  });
});
