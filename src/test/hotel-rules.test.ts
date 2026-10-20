import { describe, expect, it } from "vitest";
import { nightsBetween, orderTotals, publicAsset } from "@/lib/hotel";
import { hotelDayBounds, hotelToday } from "@/lib/dates";

describe("hotel rules", () => {
  it("counts nights between check-in and check-out", () => {
    expect(nightsBetween("2026-11-01", "2026-11-04")).toBe(3);
    expect(nightsBetween("2026-11-04", "2026-11-01")).toBe(0);
  });
  it("applies service charge after discount", () => {
    expect(orderTotals(5000, 1000, 10)).toEqual({
      base: 4000,
      service: 400,
      tax: 0,
      total: 4400,
    });
  });
  it("calculates tax against the discounted subtotal", () => {
    expect(orderTotals(5000, 1000, 10, 5)).toEqual({
      base: 4000,
      service: 400,
      tax: 200,
      total: 4600,
    });
  });
  it("resolves site assets beneath the configured deployment base path", () => {
    expect(publicAsset("/images/room.jpg")).toBe(`${import.meta.env.BASE_URL}images/room.jpg`);
    expect(publicAsset("https://example.com/room.jpg")).toBe("https://example.com/room.jpg");
  });
  it("uses Sri Lanka local dates for availability and daily reports", () => {
    expect(hotelToday(new Date("2026-10-19T20:00:00.000Z"))).toBe("2026-10-20");
    expect(hotelDayBounds("2026-10-20")).toEqual({
      start: "2026-10-19T18:30:00.000Z",
      end: "2026-10-20T18:30:00.000Z",
    });
  });
});
