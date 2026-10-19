import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { assignStaff, listStaff, removeStaff } from "@/lib/firebase-data";
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
  return (
    <div className="max-w-3xl">
      <div className="eyebrow">Access</div>
      <h1 className="mt-2 text-4xl">Staff</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Staff first create an account on the Staff login page, then add their email here.
      </p>
      <form onSubmit={add} className="mt-6 flex flex-wrap gap-3 bg-card p-5 shadow-luxe">
        <Input
          type="email"
          required
          placeholder="staff@email.com"
          className="flex-1 min-w-52"
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
        <Button type="submit">Add</Button>
      </form>
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
