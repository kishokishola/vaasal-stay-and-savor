import { useCallback, useEffect, useState, type ReactNode } from "react";
import { PriceCurrencyContext, type PriceCurrency } from "@/lib/price-currency-context";

export type { PriceCurrency } from "@/lib/price-currency-context";

const STORAGE_KEY = "vaasal-villa:price-currency";

function isPriceCurrency(value: string | null): value is PriceCurrency {
  return value === "LKR" || value === "USD";
}

export function PricingProvider({ children }: { children: ReactNode }) {
  const [currency, setCurrencyState] = useState<PriceCurrency>("LKR");

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (isPriceCurrency(saved)) setCurrencyState(saved);
    } catch (error) {
      console.error("Could not restore the selected price currency.", error);
    }

    function syncCurrency(event: StorageEvent) {
      if (event.key === STORAGE_KEY && isPriceCurrency(event.newValue)) {
        setCurrencyState(event.newValue);
      }
    }
    window.addEventListener("storage", syncCurrency);
    return () => window.removeEventListener("storage", syncCurrency);
  }, []);

  const setCurrency = useCallback((next: PriceCurrency) => {
    setCurrencyState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch (error) {
      console.error("Could not save the selected price currency.", error);
    }
  }, []);

  return (
    <PriceCurrencyContext.Provider value={{ currency, setCurrency }}>
      {children}
    </PriceCurrencyContext.Provider>
  );
}
