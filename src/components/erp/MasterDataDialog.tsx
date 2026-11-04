import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Field } from "./FormBits";
import { useErp } from "@/lib/erp/store";
import { getApiTokens } from "@/lib/api";
import { createBackendMaster, createBackendUser, type BackendMasterKind } from "@/lib/erp/backend";
import { MODULES, MODULE_LABELS, modulesForRole } from "@/lib/erp/permissions";
import type { LocationType, ModuleKey, Recipe } from "@/lib/erp/types";
import type { RoleKey } from "@/lib/erp/types";
import { hashPassword, validatePassword } from "@/lib/erp/auth";

export type MasterKind =
  "supplier" | "customer" | "location" | "rawMaterial" | "product" | "recipe" | "user";
const labels: Record<MasterKind, string> = {
  supplier: "Supplier",
  customer: "Customer",
  location: "Location / Branch",
  rawMaterial: "Raw Material",
  product: "Finished Product",
  recipe: "Recipe / BOM",
  user: "User",
};
const id = (p: string) => `${p}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const isBackendId = (value: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const defaults = {
  code: "",
  name: "",
  email: "",
  username: "",
  password: "",
  confirmPassword: "",
  phone: "",
  contact: "",
  address: "",
  type: "",
  branchId: "",
  categoryId: "",
  unit: "",
  cost: "0",
  minStock: "0",
  reorder: "0",
  price: "0",
  tax: "0",
  shelfLife: "1",
  barcode: "",
  terms: "30 Days",
  credit: "0",
  opening: "0",
  openingStock: "0",
  openingLocationId: "",
  vat: "",
  role: "Sales",
  active: "true",
  productId: "",
  outputQty: "1",
  version: "1.0",
  effectiveDate: new Date().toISOString().slice(0, 10),
  status: "Active",
};

export function MasterDataDialog({
  kind,
  open,
  onOpenChange,
}: {
  kind: MasterKind;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { db, update, refreshFromBackend, can } = useErp();
  const [f, setF] = useState(defaults);
  const [lines, setLines] = useState<Recipe["lines"]>([
    { itemId: "", qty: 1, unit: "KG", wastagePct: 0 },
  ]);
  const [modules, setModules] = useState<ModuleKey[]>([]);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (open) {
      setF(defaults);
      setLines([{ itemId: "", qty: 1, unit: "KG", wastagePct: 0 }]);
      setModules(modulesForRole(defaults.role as RoleKey));
      setSaving(false);
    }
  }, [open]);
  const set = (k: keyof typeof defaults, v: string) => setF((x) => ({ ...x, [k]: v }));
  const input = (key: keyof typeof defaults, label: string, required = false, type = "text") => (
    <Field label={label} required={required} htmlFor={`master-${kind}-${key}`}>
      <Input
        id={`master-${kind}-${key}`}
        name={key}
        type={type}
        autoComplete={
          key === "username"
            ? "username"
            : key === "email"
              ? "email"
              : key === "password" || key === "confirmPassword"
                ? "new-password"
                : undefined
        }
        value={f[key]}
        onChange={(e) => set(key, e.target.value)}
        className="h-8"
      />
    </Field>
  );
  const select = (
    key: keyof typeof defaults,
    label: string,
    opts: { value: string; label: string }[],
    required = false,
  ) => (
    <Field label={label} required={required} htmlFor={`master-${kind}-${key}`}>
      <select
        id={`master-${kind}-${key}`}
        name={key}
        className="h-8 w-full rounded-md border bg-background px-2 text-[13px]"
        value={f[key]}
        onChange={(e) => set(key, e.target.value)}
      >
        <option value="">Select…</option>
        {opts.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </Field>
  );
  async function save() {
    if (saving) return;
    if (
      (kind !== "recipe" && !f.name.trim()) ||
      (kind !== "user" && kind !== "recipe" && !f.code.trim())
    )
      return toast.error("Complete all required fields");
    const duplicate = (
      items: { code?: string; email?: string; username?: string }[],
      key: "code" | "email" | "username",
      value: string,
    ) => items.some((x) => x[key]?.toLowerCase() === value.trim().toLowerCase());
    if (kind === "user" && (!f.email.trim() || duplicate(db.users, "email", f.email)))
      return toast.error("Enter a unique email address");
    if (kind === "user" && (!f.username.trim() || duplicate(db.users, "username", f.username)))
      return toast.error("Enter a unique username");
    if (kind === "user" && validatePassword(f.password))
      return toast.error(validatePassword(f.password) ?? "Choose a stronger password");
    if (kind === "user" && f.password !== f.confirmPassword)
      return toast.error("Passwords do not match");
    if (kind === "user" && modules.length === 0) return toast.error("Select at least one module");
    if (kind !== "user" && kind !== "recipe") {
      const list =
        kind === "supplier"
          ? db.suppliers
          : kind === "customer"
            ? db.customers
            : kind === "location"
              ? db.locations
              : kind === "rawMaterial"
                ? db.rawMaterials
                : db.products;
      if (duplicate(list, "code", f.code)) return toast.error("Code already exists");
    }
    const n = (v: string) => Number(v);
    if ([f.cost, f.minStock, f.reorder, f.price, f.tax, f.credit, f.opening].some((v) => n(v) < 0))
      return toast.error("Numeric values cannot be negative");
    if (kind === "rawMaterial" && n(f.openingStock) < 0)
      return toast.error("Opening stock cannot be negative");
    if (kind === "rawMaterial" && n(f.openingStock) > 0 && !f.openingLocationId)
      return toast.error("Select a warehouse for the opening stock");
    if (
      kind === "recipe" &&
      (!f.productId ||
        n(f.outputQty) <= 0 ||
        !f.unit ||
        !f.version.trim() ||
        !f.effectiveDate ||
        !f.status ||
        !lines.length ||
        lines.some((l) => !l.itemId || l.qty <= 0))
    )
      return toast.error("Select a product and add at least one valid material line");
    setSaving(true);
    try {
      if (getApiTokens().access) {
        if (kind === "user") {
          const assignedModules = f.role === "Administrator" ? [...MODULES] : modules;
          await createBackendUser({
            name: f.name.trim(),
            email: f.email.trim(),
            employeeCode: f.username.trim().toUpperCase(),
            role: f.role as RoleKey,
            modules: assignedModules,
            active: f.active === "true",
            password: f.password,
          });
        } else {
          await createBackendMaster(kind as BackendMasterKind, f, db, lines);
        }
        await refreshFromBackend();
        toast.success(`${labels[kind]} created`);
        onOpenChange(false);
        return;
      }

      const credentials = kind === "user" ? await hashPassword(f.password) : null;
      const assignedModules =
        kind === "user" && f.role === "Administrator" ? [...MODULES] : modules;
      const committed = update(
        (d) => {
          if (kind === "supplier")
            d.suppliers.unshift({
              id: id("SUP"),
              code: f.code.trim(),
              name: f.name.trim(),
              contact: f.contact,
              phone: f.phone,
              email: f.email,
              address: f.address,
              vat: f.vat,
              openingBalance: n(f.opening),
              paymentTerms: f.terms,
              creditLimit: n(f.credit),
              active: true,
            });
          if (kind === "customer")
            d.customers.unshift({
              id: id("CUS"),
              code: f.code.trim(),
              name: f.name.trim(),
              contact: f.contact,
              phone: f.phone,
              email: f.email,
              address: f.address,
              type: f.type || "Retail",
              vat: f.vat,
              openingBalance: n(f.opening),
              creditLimit: n(f.credit),
              paymentTerms: f.terms,
              branchId: f.branchId,
              active: true,
            });
          if (kind === "location")
            d.locations.unshift({
              id: id("LOC"),
              code: f.code.trim(),
              name: f.name.trim(),
              type: f.type as LocationType,
              address: f.address,
              active: true,
            });
          if (kind === "rawMaterial") {
            const materialId = id("RM");
            d.rawMaterials.unshift({
              id: materialId,
              code: f.code.trim(),
              name: f.name.trim(),
              categoryId: f.categoryId,
              baseUnit: f.unit,
              purchaseUnit: f.unit,
              consumptionUnit: f.unit,
              conversionFactor: 1,
              standardCost: n(f.cost),
              minStock: n(f.minStock),
              reorderLevel: n(f.reorder),
              taxRate: n(f.tax),
              active: true,
            });
            if (n(f.openingStock) > 0) {
              const adjustmentNumber = (d.counters.ADJ = (d.counters.ADJ ?? 0) + 1);
              d.stockAdjustments.unshift({
                id: id("ADJ-RM"),
                no: `ADJ-24${String(adjustmentNumber).padStart(4, "0")}`,
                date: new Date().toISOString().slice(0, 10),
                locationId: f.openingLocationId,
                itemId: materialId,
                itemType: "RM",
                batch: "",
                qty: n(f.openingStock),
                reason: "Opening raw-material stock",
                status: "Posted",
                createdBy: "User",
              });
            }
          }
          if (kind === "product")
            d.products.unshift({
              id: id("FG"),
              code: f.code.trim(),
              name: f.name.trim(),
              categoryId: f.categoryId,
              salesUnit: f.unit,
              price: n(f.price),
              standardCost: n(f.cost),
              minStock: n(f.minStock),
              taxRate: n(f.tax),
              barcode: f.barcode,
              shelfLifeDays: n(f.shelfLife),
              active: true,
            });
          if (kind === "recipe")
            d.recipes.unshift({
              id: id("REC"),
              no: `REC-${Date.now().toString().slice(-6)}`,
              productId: f.productId,
              outputQty: n(f.outputQty),
              outputUnit: f.unit || "PACK",
              version: f.version,
              effectiveDate: f.effectiveDate,
              status: f.status as Recipe["status"],
              lines,
            });
          if (kind === "user")
            d.users.unshift({
              id: id("USR"),
              name: f.name.trim(),
              email: f.email.trim(),
              username: f.username.trim().toLowerCase(),
              role: f.role as RoleKey,
              active: f.active === "true",
              modules: assignedModules,
              passwordHash: credentials?.passwordHash,
              passwordSalt: credentials?.passwordSalt,
              credentialState: "ready",
            });
        },
        {
          action: "Create",
          module: kind,
          recordType: labels[kind],
          recordNo: f.code || f.email || f.name,
          description: `Created ${labels[kind]} ${f.name}`,
        },
      );
      if (!committed) throw new Error("Database update was not committed");
      toast.success(`${labels[kind]} created`, {
        id: `created-${kind}`,
        description:
          kind === "user" ? `${f.username.trim().toLowerCase()} can now sign in.` : undefined,
      });
      onOpenChange(false);
    } catch (error) {
      toast.error(
        error instanceof Error && error.message
          ? error.message
          : `Could not create ${labels[kind]}. Please try again.`,
      );
    } finally {
      setSaving(false);
    }
  }
  const cats = (k: "RM" | "FG") =>
    db.categories
      .filter(
        (c) => c.active !== false && c.kind === k && (!getApiTokens().access || isBackendId(c.id)),
      )
      .map((c) => ({ value: c.id, label: c.name }));
  const uoms = db.uoms
    .filter((u) => u.active !== false && (!getApiTokens().access || isBackendId(u.id)))
    .map((u) => ({
      value: getApiTokens().access ? u.id : u.code,
      label: `${u.name} (${u.code})`,
    }));
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!saving) onOpenChange(next);
      }}
    >
      <DialogContent
        onInteractOutside={(event) => {
          if (saving) event.preventDefault();
        }}
        onEscapeKeyDown={(event) => {
          if (saving) event.preventDefault();
        }}
        className="max-h-[90vh] w-[calc(100vw-2rem)] max-w-2xl overflow-y-auto"
      >
        <DialogHeader>
          <DialogTitle>Add {labels[kind]}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          {kind !== "recipe" && kind !== "user" && input("code", "Code", true)}{" "}
          {kind !== "recipe" && input("name", kind === "user" ? "Full name" : "Name", true)}
          {kind === "user" && (
            <>
              {input("username", "Username", true)}
              {input("email", "Email", true, "email")}
              {input("password", "Password", true, "password")}
              {input("confirmPassword", "Confirm password", true, "password")}
              <Field label="Role" required htmlFor={`master-${kind}-role`}>
                <select
                  id={`master-${kind}-role`}
                  name="role"
                  className="h-8 w-full rounded-md border bg-background px-2 text-[13px]"
                  value={f.role}
                  onChange={(event) => {
                    const role = event.target.value as RoleKey;
                    set("role", role);
                    setModules(modulesForRole(role));
                  }}
                >
                  {[
                    "Administrator",
                    "Purchase Department",
                    "Production Department",
                    "Warehouse",
                    "Sales",
                    "Accounts",
                    "Manager",
                    "View only",
                  ].map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </Field>
              <div className="sm:col-span-2">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="text-[12px] font-medium">
                    Module access <span className="text-destructive">*</span>
                  </span>
                  <div className="flex gap-1">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-7 text-[11px]"
                      onClick={() => setModules([...MODULES])}
                    >
                      Select all
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-7 text-[11px]"
                      onClick={() => setModules([])}
                    >
                      Clear all
                    </Button>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-1 rounded-md border p-2 sm:grid-cols-3">
                  {MODULES.map((module) => (
                    <label
                      key={module}
                      className="flex min-h-9 cursor-pointer items-center gap-2 rounded px-2 py-1 text-[12px] hover:bg-accent"
                    >
                      <Checkbox
                        aria-label={`${MODULE_LABELS[module]} access`}
                        checked={modules.includes(module)}
                        onCheckedChange={(checked) =>
                          setModules((current) =>
                            checked
                              ? [...current, module]
                              : current.filter((item) => item !== module),
                          )
                        }
                      />
                      <span>{MODULE_LABELS[module]}</span>
                    </label>
                  ))}
                </div>
              </div>
              {select("active", "Status", [
                { value: "true", label: "Active" },
                { value: "false", label: "Inactive" },
              ])}
            </>
          )}
          {(kind === "supplier" || kind === "customer") && (
            <>
              {input("contact", "Contact person")}
              {input("phone", "Phone")}
              {input("email", "Email", false, "email")}
              {input("address", "Address")}
              {input("vat", "VAT / TRN")}
              {input("terms", "Payment terms")}
              {input("credit", "Credit limit", false, "number")}
              {input("opening", "Opening balance", false, "number")}
            </>
          )}
          {kind === "customer" && (
            <>
              {select("type", "Customer type", [
                { value: "Retail", label: "Retail" },
                { value: "Wholesale", label: "Wholesale" },
              ])}
              {select(
                "branchId",
                "Assigned branch / location",
                db.locations.filter((l) => l.active).map((l) => ({ value: l.id, label: l.name })),
                true,
              )}
            </>
          )}
          {kind === "location" && (
            <>
              {select(
                "type",
                "Location type",
                [
                  { value: "branch", label: "Branch" },
                  { value: "shop", label: "Shop" },
                  { value: "van", label: "Van" },
                  { value: "raw_warehouse", label: "Raw Material Warehouse" },
                  { value: "production", label: "Production" },
                  { value: "fg_warehouse", label: "Finished Goods Warehouse" },
                ],
                true,
              )}
              {input("address", "Address")}
            </>
          )}
          {kind === "rawMaterial" && (
            <>
              {select("categoryId", "Category", cats("RM"), true)}
              {select("unit", "Unit", uoms, true)}
              {input("cost", "Standard cost", true, "number")}
              {input("minStock", "Minimum stock", false, "number")}
              {input("reorder", "Reorder level", false, "number")}
              {input("tax", "Tax rate %", false, "number")}
              {can("stock_adjustments") && (
                <>
                  {input("openingStock", "Opening stock quantity", false, "number")}
                  {select(
                    "openingLocationId",
                    "Opening stock warehouse",
                    db.locations
                      .filter(
                        (location) =>
                          location.active &&
                          location.type === "raw_warehouse" &&
                          (!getApiTokens().access || isBackendId(location.id)),
                      )
                      .map((location) => ({ value: location.id, label: location.name })),
                    Number(f.openingStock) > 0,
                  )}
                </>
              )}
            </>
          )}
          {kind === "product" && (
            <>
              {select("categoryId", "Category", cats("FG"), true)}
              {select("unit", "Sales unit", uoms, true)}
              {input("price", "Selling price", true, "number")}
              {input("cost", "Standard cost", true, "number")}
              {input("minStock", "Minimum stock", false, "number")}
              {input("tax", "Tax rate %", false, "number")}
              {input("barcode", "Barcode")}
              {input("shelfLife", "Shelf life (days)", true, "number")}
            </>
          )}
          {kind === "recipe" && (
            <>
              {select(
                "productId",
                "Finished product",
                db.products
                  .filter((p) => !getApiTokens().access || isBackendId(p.id))
                  .map((p) => ({ value: p.id, label: p.name })),
                true,
              )}
              {input("outputQty", "Output quantity", true, "number")}
              {select("unit", "Output unit", uoms, true)}
              {input("version", "Version", true)}
              {input("effectiveDate", "Effective date", true, "date")}
              {select(
                "status",
                "Status",
                ["Draft", "Active", "Inactive", "Archived"].map((x) => ({ value: x, label: x })),
                true,
              )}
              <div className="sm:col-span-2 space-y-2">
                <div className="flex items-center justify-between text-sm font-medium">
                  Ingredients
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      setLines((x) => [...x, { itemId: "", qty: 1, unit: "KG", wastagePct: 0 }])
                    }
                  >
                    <Plus className="mr-1 h-3.5 w-3.5" />
                    Add line
                  </Button>
                </div>
                <div className="grid grid-cols-[1fr_80px_80px_32px] gap-2 px-1 text-[11px] font-medium text-muted-foreground">
                  <span>Material</span>
                  <span>Quantity</span>
                  <span>Wastage %</span>
                  <span className="sr-only">Actions</span>
                </div>
                {lines.map((l, i) => (
                  <div key={i} className="grid grid-cols-[1fr_80px_80px_32px] gap-2">
                    <select
                      className="h-8 rounded-md border bg-background px-2 text-xs"
                      value={l.itemId}
                      onChange={(e) =>
                        setLines((x) =>
                          x.map((a, j) =>
                            j === i
                              ? {
                                  ...a,
                                  itemId: e.target.value,
                                  unit:
                                    db.rawMaterials.find((r) => r.id === e.target.value)
                                      ?.baseUnit || a.unit,
                                }
                              : a,
                          ),
                        )
                      }
                    >
                      <option value="">Material…</option>
                      {db.rawMaterials
                        .filter((r) => !getApiTokens().access || isBackendId(r.id))
                        .map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.name}
                          </option>
                        ))}
                    </select>
                    <Input
                      aria-label="Quantity"
                      type="number"
                      min="0"
                      value={l.qty}
                      onChange={(e) =>
                        setLines((x) =>
                          x.map((a, j) => (j === i ? { ...a, qty: Number(e.target.value) } : a)),
                        )
                      }
                      className="h-8"
                    />
                    <Input
                      aria-label="Wastage percent"
                      type="number"
                      min="0"
                      value={l.wastagePct}
                      onChange={(e) =>
                        setLines((x) =>
                          x.map((a, j) =>
                            j === i ? { ...a, wastagePct: Number(e.target.value) } : a,
                          ),
                        )
                      }
                      className="h-8"
                    />
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      disabled={lines.length === 1}
                      onClick={() => setLines((x) => x.filter((_, j) => j !== i))}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" disabled={saving} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={saving} aria-busy={saving} onClick={() => void save()}>
            {saving ? "Creating…" : `Create ${labels[kind]}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
