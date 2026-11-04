import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Check, Plus, ShieldCheck, UserRound } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { MasterDataDialog } from "@/components/erp/MasterDataDialog";
import { PageHeader, PageBody, Panel } from "@/components/erp/Page";
import { StatusBadge } from "@/components/erp/StatusBadge";
import { useErp } from "@/lib/erp/store";
import { MODULES, MODULE_LABELS } from "@/lib/erp/permissions";
import type { ModuleKey } from "@/lib/erp/types";
import { getApiTokens } from "@/lib/api";
import { hashPassword, validatePassword } from "@/lib/erp/auth";
import { resetBackendUserPassword, updateBackendUserModules } from "@/lib/erp/backend";

const MODULE_GROUPS: { label: string; modules: ModuleKey[] }[] = [
  { label: "Overview", modules: ["dashboard", "reports"] },
  {
    label: "Purchasing",
    modules: ["purchasing", "suppliers", "supplier_payments", "raw_materials"],
  },
  {
    label: "Inventory",
    modules: [
      "inventory",
      "stock_adjustments",
      "material_transfers",
      "finished_goods",
      "stock_transfers",
    ],
  },
  { label: "Production", modules: ["recipes", "production", "wastage"] },
  { label: "Sales", modules: ["sales", "customers", "customer_payments", "sales_returns"] },
  { label: "Administration", modules: ["users", "settings", "audit"] },
];

export const Route = createFileRoute("/users")({ component: Users });

function Users() {
  const { db, user, can, update, refreshFromBackend } = useErp();
  const authenticatedUser = user!;
  const [open, setOpen] = useState(false);
  const [selectedId, setSelectedId] = useState(authenticatedUser.id);
  const [resetOpen, setResetOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  useEffect(() => {
    if (!db.users.some((item) => item.id === selectedId)) setSelectedId(authenticatedUser.id);
  }, [db.users, selectedId, authenticatedUser.id]);
  const selected = db.users.find((item) => item.id === selectedId) ?? authenticatedUser;
  const modules = selected.role === "Administrator" ? MODULES : (selected.modules ?? []);
  const protectedAdmin = selected.role === "Administrator" && selected.id === authenticatedUser.id;

  async function saveModules(next: ModuleKey[]) {
    if (!can("users")) return toast.error("Administrator permission required");
    if (next.length === 0) return toast.error("Assign at least one module");
    if (protectedAdmin && next.length < MODULES.length)
      return toast.error("Your active Administrator account must retain full access");
    if (getApiTokens().access) {
      try {
        await updateBackendUserModules(selected.id, next);
        await refreshFromBackend();
        toast.success(`Access updated for ${selected.name}`);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Could not update user access");
      }
      return;
    }
    update(
      (draft) => {
        const target = draft.users.find((item) => item.id === selected.id);
        if (target) target.modules = next;
      },
      {
        action: "Update",
        module: "users",
        recordType: "User access",
        recordNo: selected.email,
        description: `Updated module access for ${selected.name}`,
      },
    );
    toast.success(`Access updated for ${selected.name}`);
  }
  const toggle = (module: ModuleKey, checked: boolean) =>
    void saveModules(
      checked ? [...new Set([...modules, module])] : modules.filter((item) => item !== module),
    );

  async function resetPassword() {
    const error = validatePassword(password);
    if (error) return toast.error(error);
    if (password !== confirmPassword) return toast.error("Passwords do not match");
    if (getApiTokens().access) {
      try {
        await resetBackendUserPassword(selected.id, password);
        await refreshFromBackend();
        setPassword("");
        setConfirmPassword("");
        setResetOpen(false);
        toast.success(`Password reset for ${selected.name}`);
      } catch (resetError) {
        toast.error(resetError instanceof Error ? resetError.message : "Could not reset password");
      }
      return;
    }
    const credentials = await hashPassword(password);
    update(
      (draft) => {
        const target = draft.users.find((item) => item.id === selected.id);
        if (target)
          Object.assign(target, credentials, {
            credentialState: "ready" as const,
            mustChangePassword: false,
          });
      },
      {
        action: "Reset password",
        module: "users",
        recordType: "User credentials",
        recordNo: selected.username ?? selected.email,
        description: `Reset password for ${selected.name}`,
      },
    );
    setPassword("");
    setConfirmPassword("");
    setResetOpen(false);
    toast.success(`Password reset for ${selected.name}`);
  }

  return (
    <>
      <PageHeader
        title="Users & Roles"
        subtitle="Assign each user access to one or many business modules."
        actions={
          <Button size="sm" disabled={!can("users")} onClick={() => setOpen(true)}>
            <Plus className="mr-1 h-3.5 w-3.5" />
            Add User
          </Button>
        }
      />
      <MasterDataDialog kind="user" open={open} onOpenChange={setOpen} />
      <Dialog open={resetOpen} onOpenChange={setResetOpen}>
        <DialogContent className="w-[calc(100vw-2rem)] max-w-md">
          <DialogHeader>
            <DialogTitle>Reset password</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Set a new password for {selected.name}. Passwords are stored as salted hashes.
          </p>
          <div className="space-y-2">
            <Label htmlFor="reset-password">New password</Label>
            <Input
              id="reset-password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirm-reset-password">Confirm password</Label>
            <Input
              id="confirm-reset-password"
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResetOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => void resetPassword()}>Reset password</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <PageBody>
        <div className="grid min-w-0 gap-3 lg:grid-cols-[280px_minmax(0,1fr)]">
          <Panel
            title="Team members"
            description={`${db.users.filter((item) => item.active).length} active users`}
            bodyClass="p-2"
          >
            <div className="space-y-1">
              {db.users.map((item) => (
                <button
                  key={item.id}
                  onClick={() => setSelectedId(item.id)}
                  className={`flex w-full items-center gap-2 rounded-md border px-3 py-2 text-left transition-colors ${selected.id === item.id ? "border-primary bg-primary/5" : "border-transparent hover:bg-accent"}`}
                >
                  <span className="grid h-8 w-8 place-items-center rounded-full bg-muted">
                    <UserRound className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium">{item.name}</span>
                    <span className="block truncate text-[11px] text-muted-foreground">
                      @{item.username ?? "password-required"} · {item.email}
                    </span>
                  </span>
                  {selected.id === item.id && <Check className="h-4 w-4 text-primary" />}
                </button>
              ))}
            </div>
          </Panel>
          <Panel
            title={`${selected.name}'s access`}
            description="Changes save immediately"
            actions={<StatusBadge status={selected.active ? "Active" : "Inactive"} />}
          >
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b pb-3">
              <div>
                <div className="flex items-center gap-2 text-[13px] font-medium">
                  <ShieldCheck className="h-4 w-4 text-primary" />
                  {selected.role}
                </div>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {modules.length} of {MODULES.length} modules enabled
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!can("users") || protectedAdmin}
                  onClick={() => void saveModules([...MODULES])}
                >
                  Select all
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!can("users") || protectedAdmin}
                  onClick={() => void saveModules([])}
                >
                  Clear all
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!can("users")}
                  onClick={() => setResetOpen(true)}
                >
                  Reset password
                </Button>
              </div>
            </div>
            <div className="grid gap-4 xl:grid-cols-2">
              {MODULE_GROUPS.map((group) => {
                const enabled = group.modules.filter((module) => modules.includes(module)).length;
                return (
                  <section
                    key={group.label}
                    aria-labelledby={`group-${group.label}`}
                    className="min-w-0 rounded-md border bg-muted/10 p-2.5"
                  >
                    <div className="mb-2 flex items-center justify-between">
                      <h3
                        id={`group-${group.label}`}
                        className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"
                      >
                        {group.label}
                      </h3>
                      <span className="text-[10px] tabular-nums text-muted-foreground">
                        {enabled}/{group.modules.length}
                      </span>
                    </div>
                    <div className="grid gap-1.5 sm:grid-cols-2">
                      {group.modules.map((module) => (
                        <label
                          key={module}
                          className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md border bg-background px-3 py-2 text-[13px] hover:border-primary/50 hover:bg-accent/40"
                        >
                          <Checkbox
                            checked={modules.includes(module)}
                            disabled={!can("users") || protectedAdmin}
                            onCheckedChange={(checked) => toggle(module, checked === true)}
                            aria-label={`${MODULE_LABELS[module]} access for ${selected.name}`}
                          />
                          <span>{MODULE_LABELS[module]}</span>
                        </label>
                      ))}
                    </div>
                  </section>
                );
              })}
            </div>
          </Panel>
        </div>
      </PageBody>
    </>
  );
}
