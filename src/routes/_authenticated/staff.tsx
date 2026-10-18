import { createFileRoute, Outlet, useLocation, Navigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { StaffShell } from "@/components/staff/StaffShell";

export const Route = createFileRoute("/_authenticated/staff")({
  head: () => ({ meta: [{ title: "Staff — Vaasal Villa" }, { name: "robots", content: "noindex" }] }),
  component: StaffLayout,
});

export function useMyRoles() {
  const { user } = Route.useRouteContext();
  return useQuery({
    queryKey: ["my-roles", user.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("user_roles").select("role").eq("user_id", user.id);
      if (error) throw error;
      return data.map((r) => r.role);
    },
  });
}

function StaffLayout() {
  const { data: roles, isLoading, isError, error, refetch } = useMyRoles();
  const loc = useLocation();
  if (isLoading) return <div className="p-10 text-muted-foreground">Loading…</div>;
  if (isError)
    return (
      <div className="flex min-h-screen items-center justify-center p-8 text-center">
        <div>
          <h1 className="text-4xl">Could not verify access</h1>
          <p className="mt-3 text-muted-foreground">{error.message}</p>
          <button className="mt-4 text-sm text-primary underline" onClick={() => void refetch()}>
            Try again
          </button>
        </div>
      </div>
    );
  const isAdmin = !!roles?.includes("admin");
  const isCashier = !!roles?.includes("cashier");
  if (!isAdmin && !isCashier)
    return (
      <div className="flex min-h-screen items-center justify-center p-8 text-center">
        <div>
          <h1 className="text-4xl">Awaiting access</h1>
          <p className="mt-3 text-muted-foreground">Ask the hotel admin to add your email as staff.</p>
        </div>
      </div>
    );
  const cashierAllowed = loc.pathname.startsWith("/staff/pos") || loc.pathname.startsWith("/staff/orders");
  if (!isAdmin && !cashierAllowed) return <Navigate to="/staff/pos" />;
  return (
    <StaffShell isAdmin={isAdmin}>
      <Outlet />
    </StaffShell>
  );
}
