export type PasswordStrength = "empty" | "weak" | "fair" | "strong";

export interface PasswordCheck {
  label: string;
  ok: boolean;
}

const REQUIREMENTS: { label: string; test: (pw: string) => boolean }[] = [
  { label: "At least 8 characters", test: (pw) => pw.length >= 8 },
  { label: "Uppercase & lowercase letters", test: (pw) => /[a-z]/.test(pw) && /[A-Z]/.test(pw) },
  { label: "A number", test: (pw) => /\d/.test(pw) },
  { label: "A symbol (e.g. !@#$)", test: (pw) => /[^A-Za-z0-9]/.test(pw) },
];

/** Requirement checklist for a password. Show before typing (research: explain
 *  rules up front, never after a failed submit). */
export function passwordChecks(pw: string): PasswordCheck[] {
  return REQUIREMENTS.map((r) => ({ label: r.label, ok: r.test(pw) }));
}

export const PASSWORD_MIN = 8;

/** 0–4 score (met requirements). 0–1 weak, 2 fair, 3+ strong. */
export function passwordScore(pw: string): number {
  return passwordChecks(pw).filter((c) => c.ok).length;
}

export function passwordStrength(pw: string): PasswordStrength {
  if (!pw) return "empty";
  const score = passwordScore(pw);
  if (score <= 1) return "weak";
  if (score <= 2) return "fair";
  return "strong";
}

export function passwordStrengthLabel(strength: PasswordStrength): string {
  switch (strength) {
    case "weak":
      return "Weak";
    case "fair":
      return "Fair";
    case "strong":
      return "Strong";
    default:
      return "";
  }
}
