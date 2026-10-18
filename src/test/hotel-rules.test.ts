import { describe, expect, it } from "vitest";
import { nightsBetween, orderTotals, publicAsset } from "@/lib/hotel";

describe("hotel rules", () => {
  it("counts nights between check-in and check-out", () => {
    expect(nightsBetween("2026-11-01", "2026-11-04")).toBe(3);
    expect(nightsBetween("2026-11-04", "2026-11-01")).toBe(0);
  });
  it("applies service charge after discount", () => {
    expect(orderTotals(5000, 1000, 10)).toEqual({ base: 4000, service: 400, total: 4400 });
  });
  it("resolves site assets beneath the configured deployment base path", () => {
    expect(publicAsset("/images/room.jpg")).toBe(`${import.meta.env.BASE_URL}images/room.jpg`);
    expect(publicAsset("https://example.com/room.jpg")).toBe("https://example.com/room.jpg");
  });
});
