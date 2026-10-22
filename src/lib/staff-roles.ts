export const STAFF_ROLES = ["admin", "cashier", "cashier_restaurant", "kitchen"] as const;

export type StaffRole = (typeof STAFF_ROLES)[number];
export type StaffHomeRoute = "/staff" | "/staff/cashier" | "/staff/pos" | "/staff/kitchen";

export function parseStaffRole(role: unknown): StaffRole | null {
  return STAFF_ROLES.find((staffRole) => staffRole === role) ?? null;
}

export function staffHomeRoute(role: StaffRole): StaffHomeRoute {
  if (role === "cashier_restaurant") return "/staff/pos";
  if (role === "kitchen") return "/staff/kitchen";
  return role === "cashier" ? "/staff/cashier" : "/staff";
}

export function staffRoleLabel(role: StaffRole) {
  if (role === "cashier") return "Hotel cashier";
  if (role === "cashier_restaurant") return "Restaurant cashier";
  if (role === "kitchen") return "Kitchen";
  return "Admin";
}

export function canAccessStaffRoute(role: StaffRole, pathname: string) {
  if (role === "admin") return true;
  if (role === "cashier") {
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
  if (role === "cashier_restaurant") {
    return pathname.startsWith("/staff/pos") || pathname.startsWith("/staff/orders");
  }
  return pathname.startsWith("/staff/kitchen");
}
