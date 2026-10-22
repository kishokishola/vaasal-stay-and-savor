export const STAFF_ROLES = ["admin", "cashier"] as const;

export type StaffRole = (typeof STAFF_ROLES)[number];
export type StaffHomeRoute = "/staff" | "/staff/cashier";

export function parseStaffRole(role: unknown): StaffRole | null {
  if (role === "cashier_restaurant") return "cashier";
  return STAFF_ROLES.find((staffRole) => staffRole === role) ?? null;
}

export function staffHomeRoute(role: StaffRole): StaffHomeRoute {
  return role === "cashier" ? "/staff/cashier" : "/staff";
}

export function staffRoleLabel(role: StaffRole) {
  return role === "cashier" ? "Cashier" : "Admin";
}

export function canAccessStaffRoute(role: StaffRole, pathname: string) {
  if (role === "admin") return true;
  return (
    pathname.startsWith("/staff/cashier") ||
    pathname.startsWith("/staff/pos") ||
    pathname.startsWith("/staff/orders") ||
    pathname.startsWith("/staff/bookings") ||
    pathname.startsWith("/staff/calendar") ||
    pathname.startsWith("/staff/create-booking") ||
    pathname.startsWith("/staff/payments") ||
    pathname.startsWith("/staff/petty-cash")
  );
}
