import { useEffect, useRef } from "react";
import { hashKey, useQueryClient, type QueryKey } from "@tanstack/react-query";
import type { Unsubscribe } from "firebase/firestore";

type ChangeListener = (onChange: () => void, onError: (error: Error) => void) => Unsubscribe;

export function useFirestoreRealtime(
  queryKey: QueryKey,
  subscribe: ChangeListener,
  enabled = true,
) {
  const queryClient = useQueryClient();
  const queryKeyHash = hashKey(queryKey);
  const queryKeyRef = useRef(queryKey);
  const subscribeRef = useRef(subscribe);
  queryKeyRef.current = queryKey;
  subscribeRef.current = subscribe;

  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;
    return subscribeRef.current(
      () => {
        void queryClient.invalidateQueries({ queryKey: queryKeyRef.current });
      },
      (error) => {
        console.error("Firestore realtime updates failed.", error);
        void queryClient.invalidateQueries({ queryKey: queryKeyRef.current });
      },
    );
  }, [enabled, queryClient, queryKeyHash]);
}
