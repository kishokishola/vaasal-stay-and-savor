import { describe, expect, it } from "vitest";
import {
  canAccessStaffRoute,
  parseStaffRole,
  staffHomeRoute,
  staffRoleLabel,
} from "@/lib/staff-roles";

describe("staff roles", () => {
  it("maps the single sign-in role to its correct dashboard", () => {
    expect(staffHomeRoute("admin")).toBe("/staff");
    expect(staffHomeRoute("cashier")).toBe("/staff/cashier");
    expect(staffHomeRoute("cashier_restaurant")).toBe("/staff/pos");
    expect(staffHomeRoute("kitchen")).toBe("/staff/kitchen");
  });

  it("accepts only supported staff roles", () => {
    expect(parseStaffRole("kitchen")).toBe("kitchen");
    expect(parseStaffRole("cashier_restaurant")).toBe("cashier_restaurant");
    expect(parseStaffRole("customer")).toBeNull();
  });

  it("limits specialist staff to their operational pages", () => {
    expect(canAccessStaffRoute("cashier", "/staff/bookings")).toBe(true);
    expect(canAccessStaffRoute("cashier", "/staff/cashier")).toBe(true);
    expect(canAccessStaffRoute("cashier", "/staff/team")).toBe(false);
    expect(canAccessStaffRoute("cashier", "/staff/team")).toBe(false);
    expect(canAccessStaffRoute("cashier_restaurant", "/staff/pos")).toBe(true);
    expect(canAccessStaffRoute("cashier_restaurant", "/staff/team")).toBe(false);
    expect(canAccessStaffRoute("kitchen", "/staff/kitchen")).toBe(true);
    expect(canAccessStaffRoute("kitchen", "/staff/payments")).toBe(false);
    expect(canAccessStaffRoute("admin", "/staff/settings")).toBe(true);
  });

  it("provides human-readable role names", () => {
    expect(staffRoleLabel("cashier_restaurant")).toBe("Restaurant cashier");
    expect(staffRoleLabel("kitchen")).toBe("Kitchen");
  });
});
