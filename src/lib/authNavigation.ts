export const AUTH_PATHS = {
  login: "/auth",
  signup: "/cadastro",
  resetPassword: "/reset-password",
} as const;

export function buildSignupPath(planName?: string | null): string {
  const plan = planName?.trim();
  if (!plan) return AUTH_PATHS.signup;

  const search = new URLSearchParams({ plan });
  return `${AUTH_PATHS.signup}?${search.toString()}`;
}

export function getPlanSelectionDestination(
  isAuthenticated: boolean,
  planName: string,
): string | null {
  return isAuthenticated ? null : buildSignupPath(planName);
}
