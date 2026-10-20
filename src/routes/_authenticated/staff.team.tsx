import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { deleteUser, type User } from "firebase/auth";
import { Trash2, UserPlus } from "lucide-react";
import { assignStaff, listStaff, removeStaff } from "@/lib/firebase-data";
import { createProvisionedStaffAccount } from "@/integrations/firebase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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
  const [role, setRole] = useState<"cashier" | "admin">("cashier");
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newRole, setNewRole] = useState<"cashier" | "admin">("cashier");
  const [creating, setCreating] = useState(false);
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["staff"],
    queryFn: listStaff,
  });
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
      toast.error(error instanceof Error ? error.message : "Could not create staff account.");
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
        Only administrators can create accounts or grant staff access. Customers cannot assign
        themselves a staff role.
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
          onValueChange={(v) => setNewRole(v as "cashier" | "admin")}
          disabled={creating}
        >
          <SelectTrigger className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="cashier">Staff</SelectItem>
            <SelectItem value="admin">Admin</SelectItem>
          </SelectContent>
        </Select>
        <Button type="submit" disabled={creating}>
          <UserPlus />
          {creating ? "Creating…" : "Create account"}
        </Button>
        <p className="text-xs leading-relaxed text-muted-foreground sm:col-span-2">
          Share the initial password privately. Email verification is not required; staff can use
          the password-reset link on the sign-in page if they forget it.
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
          <Select value={role} onValueChange={(v) => setRole(v as "cashier" | "admin")}>
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="cashier">Staff</SelectItem>
              <SelectItem value="admin">Admin</SelectItem>
            </SelectContent>
          </Select>
          <Button type="submit">Grant access</Button>
        </form>
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
                {s.role === "cashier" ? "staff" : s.role}
              </Badge>
            </div>
            <Button size="icon" variant="ghost" onClick={() => remove(s.email)}>
              <Trash2 />
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
