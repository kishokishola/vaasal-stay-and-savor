import { describe, expect, it } from "vitest";
import {
  collectedOrderAmount,
  menuItemRate,
  nightsBetween,
  orderTotals,
  paymentStatusFor,
  publicAsset,
  roomRate,
} from "@/lib/hotel";
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
  it("calculates percentage adjustments with cents precision", () => {
    expect(orderTotals(2500, 250, 10, 5)).toEqual({
      base: 2250,
      service: 225,
      tax: 112.5,
      total: 2587.5,
    });
  });
  it("selects local and foreign food prices without mixing currencies", () => {
    expect(menuItemRate({ price: 1500, price_local: 1600, price_foreign: 12 }, "LKR")).toBe(1600);
    expect(menuItemRate({ price: 1500, price_local: 1600, price_foreign: 12 }, "USD")).toBe(12);
    expect(
      menuItemRate(
        {
          price: 1500,
          price_local: 1600,
          price_foreign: 12,
          price_room_local: 1800,
          price_room_foreign: 14,
        },
        "LKR",
        "room",
      ),
    ).toBe(1800);
    expect(
      menuItemRate(
        {
          price: 1500,
          price_local: 1600,
          price_foreign: 12,
          price_room_local: 1800,
          price_room_foreign: 14,
        },
        "USD",
        "room",
      ),
    ).toBe(14);
    expect(menuItemRate({ price: 1500, price_local: 1600, price_foreign: 12 }, "LKR", "room")).toBe(
      1600,
    );
    expect(menuItemRate({ price: 1500 }, "LKR")).toBe(1500);
    expect(menuItemRate({ price: 1500 }, "USD")).toBe(0);
  });
  it("selects the configured room rate for the requested currency and duration", () => {
    const room = {
      price: 10000,
      price_local: 11000,
      price_foreign: 75,
      day_rate_local: 6000,
      day_rate_foreign: 40,
    };
    expect(roomRate(room, "LKR", "night")).toBe(11000);
    expect(roomRate(room, "USD", "night")).toBe(75);
    expect(roomRate(room, "LKR", "day")).toBe(6000);
    expect(roomRate(room, "USD", "day")).toBe(40);
    expect(roomRate({ price: 10000 }, "LKR", "night")).toBe(10000);
    expect(roomRate({ price: 10000 }, "USD", "night")).toBe(0);
  });
  it("distinguishes unpaid, partial and fully paid POS tickets", () => {
    expect(paymentStatusFor(1000, 0)).toBe("unpaid");
    expect(paymentStatusFor(1000, 250)).toBe("partial");
    expect(paymentStatusFor(1000, 1000)).toBe("paid");
    expect(paymentStatusFor(1000, 1000.001)).toBe("paid");
  });
  it("reports collected amounts for both current and legacy orders", () => {
    expect(collectedOrderAmount({ total: 1000, paid_amount: 250, payment_status: "partial" })).toBe(
      250,
    );
    expect(collectedOrderAmount({ total: 1000, payment_status: "unpaid" })).toBe(0);
    expect(collectedOrderAmount({ total: 1000, status: "delivered" })).toBe(1000);
    expect(collectedOrderAmount({ total: 1000, status: "cancelled" })).toBe(0);
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
