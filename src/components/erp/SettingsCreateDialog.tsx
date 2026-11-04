import { useState } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "./FormBits";
import { useErp } from "@/lib/erp/store";
import { API_ENDPOINTS, apiJson, getApiTokens } from "@/lib/api";
import { ROLES } from "@/lib/erp/permissions";
import type { RoleKey } from "@/lib/erp/types";
export type SettingKind = "uom" | "tax" | "payment" | "employee" | "category";
const title: Record<SettingKind, string> = {
  uom: "Unit of Measurement",
  tax: "Tax Rate",
  payment: "Payment Method",
  employee: "Employee",
  category: "Category",
};
export function SettingsCreateDialog({
  kind,
  open,
  onOpenChange,
}: {
  kind: SettingKind;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { db, update, refreshFromBackend } = useErp();
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [extra, setExtra] = useState("");
  const [role, setRole] = useState<RoleKey>("Sales");
  const [saving, setSaving] = useState(false);
  const save = async () => {
    if (!name.trim() || ((kind === "uom" || kind === "employee") && !code.trim()))
      return toast.error("Complete all required fields");
    if (
      (kind === "uom" && db.uoms.some((x) => x.code.toLowerCase() === code.toLowerCase())) ||
      (kind === "employee" && db.employees.some((x) => x.code.toLowerCase() === code.toLowerCase()))
    )
      return toast.error("Code already exists");
    if (kind === "tax" && Number(extra) <= 0) return toast.error("Tax rate must be positive");
    if (kind === "employee" && getApiTokens().access) {
      return toast.error("Create employees from Users & Roles", {
        description: "Employees are loaded from backend user accounts.",
      });
    }
    if (["uom", "tax", "payment", "category"].includes(kind) && getApiTokens().access) {
      setSaving(true);
      try {
        const backendSetting = {
          uom: {
            endpoint: API_ENDPOINTS.units,
            body: { code: code.trim(), name: name.trim(), status: "ACTIVE" },
          },
          tax: {
            endpoint: API_ENDPOINTS.taxRates,
            body: { name: name.trim(), rate: Number(extra), status: "ACTIVE" },
          },
          payment: {
            endpoint: API_ENDPOINTS.paymentMethods,
            body: { name: name.trim(), status: "ACTIVE" },
          },
          category: {
            endpoint: API_ENDPOINTS.categories,
            body: {
              name: name.trim(),
              kind: extra === "FG" ? "FG" : "RM",
              status: "ACTIVE",
            },
          },
        }[kind as Exclude<SettingKind, "employee">];
        await apiJson(backendSetting.endpoint, {
          method: "POST",
          body: JSON.stringify(backendSetting.body),
        });
        await refreshFromBackend();
        toast.success(`${title[kind]} created`);
        onOpenChange(false);
        setCode("");
        setName("");
        setExtra("");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : `Could not create ${title[kind]}`);
      } finally {
        setSaving(false);
      }
      return;
    }
    update(
      (d) => {
        const id = `SET-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        if (kind === "uom") d.uoms.push({ id, code: code.trim(), name: name.trim() });
        if (kind === "tax") d.taxRates.push({ id, name: name.trim(), rate: Number(extra) });
        if (kind === "payment") d.paymentMethods.push({ id, name: name.trim() });
        if (kind === "employee")
          d.employees.push({
            id,
            code: code.trim(),
            name: name.trim(),
            department: extra.trim(),
            role,
            active: true,
          });
        if (kind === "category")
          d.categories.push({ id, name: name.trim(), kind: extra === "FG" ? "FG" : "RM" });
      },
      {
        action: "Create",
        module: "settings",
        recordType: title[kind],
        recordNo: code || name,
        description: `Created ${title[kind]} ${name}`,
      },
    );
    toast.success(`${title[kind]} created`);
    onOpenChange(false);
    setCode("");
    setName("");
    setExtra("");
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-2rem)] max-w-md">
        <DialogHeader>
          <DialogTitle>Add {title[kind]}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {(kind === "uom" || kind === "employee") && (
            <Field label="Code" required>
              <Input className="h-8" value={code} onChange={(e) => setCode(e.target.value)} />
            </Field>
          )}
          <Field label="Name" required>
            <Input className="h-8" value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          {kind === "tax" && (
            <Field label="Rate %" required>
              <Input
                className="h-8"
                type="number"
                min="0"
                value={extra}
                onChange={(e) => setExtra(e.target.value)}
              />
            </Field>
          )}
          {kind === "employee" && (
            <>
              <Field label="Department" required>
                <Input className="h-8" value={extra} onChange={(e) => setExtra(e.target.value)} />
              </Field>
              <Field label="Role">
                <select
                  className="h-8 w-full rounded-md border bg-background px-2 text-sm"
                  value={role}
                  onChange={(e) => setRole(e.target.value as RoleKey)}
                >
                  {ROLES.map((r) => (
                    <option key={r}>{r}</option>
                  ))}
                </select>
              </Field>
            </>
          )}
          {kind === "category" && (
            <Field label="Category type">
              <select
                className="h-8 w-full rounded-md border bg-background px-2 text-sm"
                value={extra}
                onChange={(e) => setExtra(e.target.value)}
              >
                <option value="RM">Raw Material</option>
                <option value="FG">Finished Goods</option>
              </select>
            </Field>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" disabled={saving} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={saving} onClick={() => void save()}>
            {saving ? "Creating…" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
