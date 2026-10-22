import { describe, expect, it } from "vitest";
import {
  canAccessStaffRoute,
  parseStaffRole,
  staffHomeRoute,
  staffRoleLabel,
} from "@/lib/staff-roles";

describe("staff roles", () => {
  it("maps the two sign-in roles to their correct dashboards", () => {
    expect(staffHomeRoute("admin")).toBe("/staff");
    expect(staffHomeRoute("cashier")).toBe("/staff/cashier");
  });

  it("accepts only supported staff roles", () => {
    expect(parseStaffRole("admin")).toBe("admin");
    expect(parseStaffRole("cashier")).toBe("cashier");
    expect(parseStaffRole("kitchen")).toBeNull();
    expect(parseStaffRole("cashier_restaurant")).toBe("cashier");
    expect(parseStaffRole("customer")).toBeNull();
  });

  it("limits cashiers to hotel and restaurant operating pages", () => {
    expect(canAccessStaffRoute("cashier", "/staff/bookings")).toBe(true);
    expect(canAccessStaffRoute("cashier", "/staff/cashier")).toBe(true);
    expect(canAccessStaffRoute("cashier", "/staff/pos")).toBe(true);
    expect(canAccessStaffRoute("cashier", "/staff/orders")).toBe(true);
    expect(canAccessStaffRoute("cashier", "/staff/kitchen")).toBe(false);
    expect(canAccessStaffRoute("cashier", "/staff/team")).toBe(false);
    expect(canAccessStaffRoute("cashier", "/staff/funds")).toBe(false);
    expect(canAccessStaffRoute("cashier", "/staff/settings")).toBe(false);
    expect(canAccessStaffRoute("admin", "/staff/settings")).toBe(true);
  });

  it("provides human-readable role names", () => {
    expect(staffRoleLabel("admin")).toBe("Admin");
    expect(staffRoleLabel("cashier")).toBe("Cashier");
  });
});
