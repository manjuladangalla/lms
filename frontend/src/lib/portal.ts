export function portalFor(role?: string | null): string {
  if (role === "parent") return "/parent";
  if (role === "admin" || role === "lecturer" || role === "counselor") return "/admin";
  return "/dashboard";
}

export const STAFF_ROLES = ["admin", "lecturer", "counselor"];
