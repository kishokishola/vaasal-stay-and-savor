export const HOTEL = {
  name: "Vaasal Villa",
  tagline: "A luxury villa hotel in the heart of Jaffna",
  phone: "+94 76 465 8567",
  whatsapp: "94764658567",
  email: "stay@vaasalvilla.lk",
  address: "Jaffna, Northern Province, Sri Lanka",
};

export const lkr = (n: number | string) =>
  "LKR " + Number(n).toLocaleString("en-LK", { maximumFractionDigits: 2 });

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
export function orderTotals(subtotal: number, discount: number, servicePct: number) {
  const base = Math.max(0, subtotal - discount);
  const service = Math.round(base * servicePct) / 100;
  return { base, service, total: base + service };
}

export const roomsQuery = {
  queryKey: ["rooms"],
  queryFn: () => import("@/lib/firebase-data").then(({ getRooms }) => getRooms(true)),
};
