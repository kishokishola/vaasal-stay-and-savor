import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "@/integrations/firebase/client";
import { getStaffAccess } from "@/lib/firebase-data";

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

    const unsubscribe = onAuthStateChanged(auth, () => {
      void qc.invalidateQueries({ queryKey: ["staff-auth-state"] });
    });

    return unsubscribe;
  }, [qc]);

  return useQuery<StaffAuthState>({
    queryKey: ["staff-auth-state"],
    queryFn: async (): Promise<StaffAuthState> => {
      if (typeof window === "undefined") {
        return { isAuthenticated: false, isStaff: false, isAdmin: false, userId: null };
      }

      const user = auth.currentUser;
      if (!user) {
        return { isAuthenticated: false, isStaff: false, isAdmin: false, userId: null };
      }
      const role = user.email ? await getStaffAccess(user.email) : null;
      const isAdmin = role === "admin";
      return {
        isAuthenticated: true,
        isStaff: role !== null,
        isAdmin,
        userId: user.uid,
      };
    },
    staleTime: 60 * 1000,
  });
}
