import { createFileRoute, Outlet, useLocation, Navigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { StaffShell } from "@/components/staff/StaffShell";
import { BrandLogo } from "@/components/site/BrandLogo";
import { getStaffAccess } from "@/lib/firebase-data";
import { canAccessStaffRoute, staffHomeRoute } from "@/lib/staff-roles";

export const Route = createFileRoute("/_authenticated/staff")({
  head: () => ({
    meta: [{ title: "Staff — Vaasal Villa" }, { name: "robots", content: "noindex" }],
  }),
  component: StaffLayout,
});

export function useMyRoles() {
  const { user } = Route.useRouteContext();
  return useQuery({
    queryKey: ["my-roles", user.uid],
    queryFn: async () => (user.email ? getStaffAccess(user.email) : null),
  });
}

function StaffLayout() {
  const { data: roles, isLoading, isError, error, refetch } = useMyRoles();
  const loc = useLocation();
  if (isLoading)
    return (
      <div className="flex min-h-screen items-center justify-center p-8">
        <div className="space-y-6 text-center">
          <BrandLogo size="auth" subtitle="Staff portal" />
          <p className="text-muted-foreground">Loading your staff access…</p>
        </div>
      </div>
    );
  if (isError)
    return (
      <div className="flex min-h-screen items-center justify-center p-8 text-center">
        <div className="space-y-5">
          <BrandLogo size="auth" subtitle="Staff portal" />
          <h1 className="text-4xl">Could not verify access</h1>
          <p className="mt-3 text-muted-foreground">{error.message}</p>
          <button className="mt-4 text-sm text-primary underline" onClick={() => void refetch()}>
            Try again
          </button>
        </div>
      </div>
    );
  if (!roles)
    return (
      <div className="flex min-h-screen items-center justify-center p-8 text-center">
        <div className="space-y-5">
          <BrandLogo size="auth" subtitle="Staff portal" />
          <h1 className="text-4xl">Awaiting access</h1>
          <p className="mt-3 text-muted-foreground">
            Ask the hotel admin to add your email as staff.
          </p>
        </div>
      </div>
    );
  if (!canAccessStaffRoute(roles, loc.pathname))
    return <Navigate to={staffHomeRoute(roles)} replace />;
  return (
    <StaffShell role={roles}>
      <Outlet />
    </StaffShell>
  );
}
