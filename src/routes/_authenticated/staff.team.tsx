import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { deleteUser, sendPasswordResetEmail, type User } from "firebase/auth";
import { KeyRound, Trash2, UserPlus } from "lucide-react";
import {
  approveStaffRegistration,
  assignStaff,
  dismissStaffRegistration,
  listStaff,
  listStaffRegistrations,
  removeStaff,
  subscribeToStaffRegistrations,
} from "@/lib/firebase-data";
import { auth, createProvisionedStaffAccount } from "@/integrations/firebase/client";
import { parseStaffRole, staffRoleLabel, STAFF_ROLES, type StaffRole } from "@/lib/staff-roles";
import { staffAuthErrorMessage, staffPasswordResetActionSettings } from "@/lib/staff-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useFirestoreRealtime } from "@/hooks/useFirestoreRealtime";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/staff/team")({
  component: Team,
});

function Team() {
  const qc = useQueryClient();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<StaffRole>("cashier");
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newRole, setNewRole] = useState<StaffRole>("cashier");
  const [creating, setCreating] = useState(false);
  const [resettingEmail, setResettingEmail] = useState("");
  const [approvingEmail, setApprovingEmail] = useState("");
  const [registrationRoles, setRegistrationRoles] = useState<Record<string, StaffRole>>({});
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["staff"],
    queryFn: listStaff,
  });
  const registrations = useQuery({
    queryKey: ["staff-registrations"],
    queryFn: listStaffRegistrations,
  });
  useFirestoreRealtime(["staff-registrations"], subscribeToStaffRegistrations);
  async function add(e: React.FormEvent) {
    e.preventDefault();
    try {
      await assignStaff(email, role);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not add staff.");
      return;
    }
    toast.success("Staff added");
    setEmail("");
    qc.invalidateQueries({ queryKey: ["staff"] });
  }
  async function sendReset(email: string) {
    setResettingEmail(email);
    try {
      await sendPasswordResetEmail(
        auth,
        email,
        staffPasswordResetActionSettings(window.location.origin, import.meta.env.BASE_URL),
      );
      toast.success(
        `Firebase accepted the reset request for ${email}. If the Firebase account exists, its owner should check their inbox and spam folder.`,
      );
    } catch (error) {
      toast.error(staffAuthErrorMessage(error, window.location.hostname));
    } finally {
      setResettingEmail("");
    }
  }
  async function approveRegistration(email: string) {
    setApprovingEmail(email);
    try {
      await approveStaffRegistration(email, registrationRoles[email] ?? "cashier");
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["staff"] }),
        qc.invalidateQueries({ queryKey: ["staff-registrations"] }),
      ]);
      toast.success(`${email} can now sign in to the assigned staff dashboard.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not approve staff access.");
    } finally {
      setApprovingEmail("");
    }
  }
  async function dismissRegistration(email: string) {
    if (!confirm(`Dismiss the access request for ${email}?`)) return;
    try {
      await dismissStaffRegistration(email);
      await qc.invalidateQueries({ queryKey: ["staff-registrations"] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not dismiss access request.");
    }
  }
  async function remove(email: string) {
    if (!confirm("Remove this access?")) return;
    try {
      await removeStaff(email);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not remove staff.");
      return;
    }
    qc.invalidateQueries({ queryKey: ["staff"] });
  }
  async function createAccount(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    let user: User;
    try {
      user = await createProvisionedStaffAccount(newEmail, newPassword);
    } catch (error) {
      toast.error(staffAuthErrorMessage(error, window.location.hostname));
      setCreating(false);
      return;
    }
    try {
      await assignStaff(newEmail, newRole);
    } catch (error) {
      try {
        await deleteUser(user);
      } catch (cleanupError) {
        console.error("Could not remove an unassigned staff account.", cleanupError);
        toast.error(
          "The account was created but staff access could not be assigned or rolled back. Remove it in Firebase Authentication, then retry.",
        );
        setCreating(false);
        return;
      }
      toast.error(error instanceof Error ? error.message : "Could not assign staff access.");
      setCreating(false);
      return;
    }
    toast.success(`Staff account created for ${newEmail.trim().toLowerCase()}.`);
    setNewEmail("");
    setNewPassword("");
    qc.invalidateQueries({ queryKey: ["staff"] });
    setCreating(false);
  }
  return (
    <div className="max-w-3xl">
      <div className="eyebrow">Access</div>
      <h1 className="mt-2 text-4xl">Staff</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Create Firebase sign-in accounts for hotel and restaurant staff here. Legacy Supabase
        passwords do not transfer. Only administrators can create accounts, send reset links, or
        grant staff access.
      </p>
      <form
        onSubmit={createAccount}
        className="mt-6 grid gap-3 bg-card p-5 shadow-luxe sm:grid-cols-2"
      >
        <h2 className="font-display text-2xl sm:col-span-2">Create staff account</h2>
        <Input
          type="email"
          required
          autoComplete="off"
          placeholder="staff@email.com"
          value={newEmail}
          onChange={(e) => setNewEmail(e.target.value)}
          disabled={creating}
        />
        <Input
          type="password"
          required
          minLength={6}
          autoComplete="new-password"
          placeholder="Initial password (at least 6 characters)"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          disabled={creating}
        />
        <Select
          value={newRole}
          onValueChange={(value) => {
            const selectedRole = parseStaffRole(value);
            if (selectedRole) setNewRole(selectedRole);
          }}
          disabled={creating}
        >
          <SelectTrigger className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STAFF_ROLES.map((staffRole) => (
              <SelectItem key={staffRole} value={staffRole}>
                {staffRoleLabel(staffRole)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button type="submit" disabled={creating}>
          <UserPlus />
          {creating ? "Creating…" : "Create account"}
        </Button>
        <p className="text-xs leading-relaxed text-muted-foreground sm:col-span-2">
          Share the initial password privately. Staff can change a forgotten password using the
          email reset link on the sign-in page. If the email already has a Firebase account, use
          “Grant access” below if needed and send a reset link from the staff list.
        </p>
      </form>
      <div className="mt-6 bg-card p-5 shadow-luxe">
        <h2 className="font-display text-xl">Grant access to an existing account</h2>
        <form onSubmit={add} className="mt-4 flex flex-wrap gap-3">
          <Input
            type="email"
            required
            placeholder="staff@email.com"
            className="min-w-52 flex-1"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <Select
            value={role}
            onValueChange={(value) => {
              const selectedRole = parseStaffRole(value);
              if (selectedRole) setRole(selectedRole);
            }}
          >
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STAFF_ROLES.map((staffRole) => (
                <SelectItem key={staffRole} value={staffRole}>
                  {staffRoleLabel(staffRole)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button type="submit">Grant access</Button>
        </form>
      </div>
      <div className="mt-6 divide-y divide-border bg-card shadow-luxe">
        <div className="p-5">
          <h2 className="font-display text-xl">Staff access requests</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Approve a request only after verifying the person. Selecting a role grants access to
            that role's dashboard and navigation.
          </p>
        </div>
        {registrations.isLoading && (
          <p className="p-4 text-sm text-muted-foreground">Loading access requests…</p>
        )}
        {registrations.isError && (
          <p role="alert" className="p-4 text-sm text-destructive">
            Could not load access requests: {registrations.error.message}
          </p>
        )}
        {registrations.data?.length === 0 && (
          <p className="p-4 text-sm text-muted-foreground">No pending staff requests.</p>
        )}
        {registrations.data?.map((request) => (
          <div
            key={request.email}
            className="flex flex-wrap items-center justify-between gap-3 p-4"
          >
            <div>
              <div className="font-medium">{request.email}</div>
              <div className="text-xs text-muted-foreground">
                Requested {new Date(request.created_at).toLocaleString()}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Select
                value={registrationRoles[request.email] ?? "cashier"}
                onValueChange={(value) => {
                  const selectedRole = parseStaffRole(value);
                  if (selectedRole)
                    setRegistrationRoles((current) => ({
                      ...current,
                      [request.email]: selectedRole,
                    }));
                }}
                disabled={approvingEmail === request.email}
              >
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STAFF_ROLES.filter((staffRole) => staffRole !== "admin").map((staffRole) => (
                    <SelectItem key={staffRole} value={staffRole}>
                      {staffRoleLabel(staffRole)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                onClick={() => void approveRegistration(request.email)}
                disabled={approvingEmail === request.email}
              >
                {approvingEmail === request.email ? "Approving…" : "Approve"}
              </Button>
              <Button
                variant="outline"
                onClick={() => void dismissRegistration(request.email)}
                disabled={approvingEmail === request.email}
              >
                Dismiss
              </Button>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-6 divide-y divide-border bg-card shadow-luxe">
        {isLoading && <p className="p-4 text-sm text-muted-foreground">Loading staff…</p>}
        {isError && (
          <p role="alert" className="p-4 text-sm text-destructive">
            Could not load staff: {error.message}
          </p>
        )}
        {data?.map((s) => (
          <div key={s.role_id} className="flex items-center justify-between p-4">
            <div>
              {s.email}{" "}
              <Badge variant="secondary" className="ml-2">
                {staffRoleLabel(s.role)}
              </Badge>
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="sm"
                onClick={() => void sendReset(s.email)}
                disabled={resettingEmail === s.email}
              >
                <KeyRound />
                {resettingEmail === s.email ? "Sending…" : "Reset password"}
              </Button>
              <Button size="icon" variant="ghost" onClick={() => remove(s.email)}>
                <Trash2 />
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
