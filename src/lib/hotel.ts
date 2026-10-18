import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

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

export function useSession() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    return () => data.subscription.unsubscribe();
  }, []);
  return { session, ready };
}

export function useRoles(userId?: string) {
  const [roles, setRoles] = useState<string[] | null>(null);
  useEffect(() => {
    if (!userId) return;
    supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .then(({ data }) => setRoles((data ?? []).map((r) => r.role)));
  }, [userId]);
  return roles;
}

export const roomsQuery = {
  queryKey: ["rooms"],
  queryFn: async () => {
    const { data, error } = await supabase.from("rooms").select("*").eq("active", true).order("code");
    if (error) throw error;
    return data;
  },
};
