export const HOTEL = {
  name: "Vaasal Villa",
  tagline: "A luxury villa hotel in the heart of Jaffna",
  phone: "+94 76 465 8567",
  whatsapp: "94764658567",
  email: "stay@vaasalvilla.lk",
  address: "Jaffna, Northern Province, Sri Lanka",
  facebook: "",
  instagram: "",
  twitter: "",
  youtube: "",
};

export const lkr = (n: number | string) =>
  "LKR " + Number(n).toLocaleString("en-LK", { maximumFractionDigits: 2 });

export function rateAmount(amount: number | string, currency?: string) {
  const value = Number(amount);
  return currency === "USD"
    ? `USD ${value.toLocaleString("en-US", { maximumFractionDigits: 2 })}`
    : lkr(value);
}

export function roomRate(
  room: {
    price: number;
    price_local?: number;
    price_foreign?: number;
    day_rate_local?: number;
    day_rate_foreign?: number;
  },
  currency: "LKR" | "USD",
  period: "night" | "day",
) {
  if (period === "night")
    return currency === "USD" ? (room.price_foreign ?? 0) : (room.price_local ?? room.price);
  return currency === "USD" ? (room.day_rate_foreign ?? 0) : (room.day_rate_local ?? room.price);
}

export function publicAsset(path: string) {
  if (/^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(path)) return path;
  return `${import.meta.env.BASE_URL}${path.replace(/^\/+/, "")}`;
}

export function nightsBetween(a: string, b: string) {
  if (!a || !b) return 0;
  const d = (new Date(b).getTime() - new Date(a).getTime()) / 86400000;
  return d > 0 ? Math.round(d) : 0;
}

/** Order totals: service charge is a percentage of (subtotal - discount). */
export function orderTotals(subtotal: number, discount: number, servicePct: number, taxPct = 0) {
  const base = Math.max(0, subtotal - discount);
  const service = Math.round(base * servicePct) / 100;
  const tax = Math.round(base * taxPct) / 100;
  return { base, service, tax, total: base + service + tax };
}

export function paymentStatusFor(total: number, paid: number): "paid" | "unpaid" | "partial" {
  const totalCents = Math.round(total * 100);
  const paidCents = Math.round(paid * 100);
  if (paidCents <= 0) return "unpaid";
  return paidCents >= totalCents ? "paid" : "partial";
}

export function collectedOrderAmount(order: {
  total: number | string;
  paid_amount?: number;
  payment_status?: string;
  status?: string;
}) {
  if (typeof order.paid_amount === "number") return order.paid_amount;
  if (
    order.payment_status === "paid" ||
    (!order.payment_status && order.status !== "pending" && order.status !== "cancelled")
  )
    return Number(order.total);
  return 0;
}

export const roomsQuery = {
  queryKey: ["rooms"],
  queryFn: () => import("@/lib/public-catalog").then(({ getPublicRooms }) => getPublicRooms()),
};
