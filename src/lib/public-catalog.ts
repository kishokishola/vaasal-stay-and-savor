import type { Tables } from "@/integrations/supabase/types";
import {
  getMenuItems,
  getRoomByCode,
  getRooms,
  type MenuItem,
  type Room,
} from "@/lib/firebase-data";

const supabaseUrl = import.meta.env["VITE_SUPABASE_URL"];
const supabaseKey = import.meta.env["VITE_SUPABASE_PUBLISHABLE_KEY"];

function isConfigured() {
  return Boolean(supabaseUrl && supabaseKey);
}

async function readSupabaseRows<T>(table: "rooms" | "menu_items", filters: Record<string, string>) {
  if (!isConfigured()) throw new Error("The public catalogue database is not configured.");

  const url = new URL(`/rest/v1/${table}`, supabaseUrl);
  url.searchParams.set("select", "*");
  for (const [key, value] of Object.entries(filters)) url.searchParams.set(key, value);

  const response = await fetch(url, {
    headers: {
      apikey: supabaseKey!,
      Authorization: `Bearer ${supabaseKey!}`,
    },
  });
  if (!response.ok) {
    throw new Error(`Could not load the public ${table} catalogue (${response.status}).`);
  }

  const rows: unknown = await response.json();
  if (!Array.isArray(rows)) throw new Error(`The public ${table} catalogue response was invalid.`);
  return rows as T[];
}

async function withSupabaseFallback<T>(
  label: string,
  primary: () => Promise<T[]>,
  fallback: () => Promise<T[]>,
) {
  let primaryError: unknown;
  try {
    const rows = await primary();
    if (rows.length > 0) return rows;
  } catch (error) {
    primaryError = error;
    console.warn(`Firebase ${label} catalogue is unavailable; trying Supabase.`, error);
  }

  try {
    return await fallback();
  } catch (fallbackError) {
    if (primaryError) {
      throw new AggregateError(
        [primaryError, fallbackError],
        `Could not load ${label} from Firebase or Supabase.`,
      );
    }
    throw fallbackError;
  }
}

export function getPublicRooms() {
  return withSupabaseFallback<Room>(
    "room",
    () => getRooms(true),
    () => readSupabaseRows<Tables<"rooms">>("rooms", { active: "eq.true", order: "code.asc" }),
  );
}

export async function getPublicRoomByCode(code: string) {
  const rooms = await withSupabaseFallback<Room>(
    "room",
    async () => {
      const room = await getRoomByCode(code);
      return room ? [room] : [];
    },
    () =>
      readSupabaseRows<Tables<"rooms">>("rooms", {
        code: `eq.${code}`,
        active: "eq.true",
        limit: "1",
      }),
  );
  return rooms[0] ?? null;
}

export function getPublicMenuItems() {
  return (async () => {
    let primaryError: unknown;
    try {
      const rows = await getMenuItems();
      if (rows.length) return rows.filter((item) => item.available && !item.deleted);
    } catch (error) {
      primaryError = error;
      console.warn("Firebase menu catalogue is unavailable; trying Supabase.", error);
    }

    try {
      return await readSupabaseRows<MenuItem>("menu_items", {
        available: "eq.true",
        order: "category.asc,name.asc",
      });
    } catch (fallbackError) {
      if (primaryError) {
        throw new AggregateError(
          [primaryError, fallbackError],
          "Could not load menu from Firebase or Supabase.",
        );
      }
      throw fallbackError;
    }
  })();
}
