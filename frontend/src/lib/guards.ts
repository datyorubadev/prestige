import type { Role, SessionUser } from "@/lib/types";

/** True when the user holds one of the allowed roles. */
export function hasRole(user: SessionUser | null, roles: Role[]): boolean {
  return !!user && roles.includes(user.role);
}

/** Convenience: can the user reach a given role-gated surface? */
export function canAccess(user: SessionUser | null, roles: Role[]): boolean {
  return hasRole(user, roles);
}

/** Super admin is the only role that ever impersonates a tenant. */
export function canImpersonate(user: SessionUser | null): boolean {
  return user?.role === "super_admin";
}
