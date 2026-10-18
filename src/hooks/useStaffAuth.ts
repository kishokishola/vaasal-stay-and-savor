import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface StaffAuthState {
  isAuthenticated: boolean;
  isStaff: boolean;
  isAdmin: boolean;
  userId: string | null;
}

export function useStaffAuth() {
  const qc = useQueryClient();

  useEffect(() => {
    if (typeof window === "undefined") return;

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      void qc.invalidateQueries({ queryKey: ["staff-auth-state"] });
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [qc]);

  return useQuery<StaffAuthState>({
    queryKey: ["staff-auth-state"],
    queryFn: async (): Promise<StaffAuthState> => {
      if (typeof window === "undefined") {
        return { isAuthenticated: false, isStaff: false, isAdmin: false, userId: null };
      }

      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user) {
          return { isAuthenticated: false, isStaff: false, isAdmin: false, userId: null };
        }

        const { data: roles, error } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", session.user.id);

        if (error || !roles) {
          return { isAuthenticated: true, isStaff: false, isAdmin: false, userId: session.user.id };
        }

        const roleNames = roles.map((r) => r.role);
        const isAdmin = roleNames.includes("admin");
        const isCashier = roleNames.includes("cashier");
        const isStaff = isAdmin || isCashier;

        return {
          isAuthenticated: true,
          isStaff,
          isAdmin,
          userId: session.user.id,
        };
      } catch {
        return { isAuthenticated: false, isStaff: false, isAdmin: false, userId: null };
      }
    },
    staleTime: 60 * 1000,
  });
}
