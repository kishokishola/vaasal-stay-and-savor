import { createContext, useContext } from "react";

export type PriceCurrency = "LKR" | "USD";

export const PriceCurrencyContext = createContext<{
  currency: PriceCurrency;
  setCurrency: (currency: PriceCurrency) => void;
} | null>(null);

export function usePriceCurrency() {
  const value = useContext(PriceCurrencyContext);
  if (!value) throw new Error("PriceCurrencyProvider is missing from the application.");
  return value;
}
