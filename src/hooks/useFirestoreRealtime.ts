import { useEffect, useRef } from "react";
import { hashKey, useQueryClient, type QueryKey } from "@tanstack/react-query";
import type { Unsubscribe } from "firebase/firestore";

type ChangeListener = (onChange: () => void, onError: (error: Error) => void) => Unsubscribe;

export function useFirestoreRealtime(
  queryKey: QueryKey,
  subscribe: ChangeListener,
  enabled = true,
  onError?: (error: Error) => void,
) {
  const queryClient = useQueryClient();
  const queryKeyHash = hashKey(queryKey);
  const queryKeyRef = useRef(queryKey);
  const subscribeRef = useRef(subscribe);
  const errorRef = useRef(onError);
  queryKeyRef.current = queryKey;
  subscribeRef.current = subscribe;
  errorRef.current = onError;

  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;
    return subscribeRef.current(
      () => {
        void queryClient.invalidateQueries({ queryKey: queryKeyRef.current });
      },
      (error) => {
        console.error("Firestore realtime updates failed.", error);
        errorRef.current?.(error);
        void queryClient.invalidateQueries({ queryKey: queryKeyRef.current });
      },
    );
  }, [enabled, queryClient, queryKeyHash]);
}
