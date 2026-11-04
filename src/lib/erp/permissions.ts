import type { ModuleKey, RoleKey } from "./types";
export type { ModuleKey } from "./types";

export const ROLES: RoleKey[] = [
  "Administrator",
  "Purchase Department",
  "Production Department",
  "Warehouse",
  "Sales",
  "Accounts",
  "Manager",
  "View only",
];

/** Modules the app guards. "view" is broad, "manage" is restricted. */
export const MODULES: ModuleKey[] = [
  "dashboard",
  "purchasing",
  "suppliers",
  "supplier_payments",
  "raw_materials",
  "inventory",
  "stock_adjustments",
  "material_transfers",
  "recipes",
  "production",
  "wastage",
  "finished_goods",
  "stock_transfers",
  "sales",
  "customers",
  "customer_payments",
  "sales_returns",
  "reports",
  "users",
  "settings",
  "audit",
];
export const MODULE_LABELS: Record<ModuleKey, string> = Object.fromEntries(
  MODULES.map((key) => [key, key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())]),
) as Record<ModuleKey, string>;

const MANAGE: Record<ModuleKey, RoleKey[]> = {
  dashboard: [],
  purchasing: ["Purchase Department", "Accounts"],
  suppliers: ["Purchase Department", "Accounts"],
  supplier_payments: ["Accounts"],
  raw_materials: ["Purchase Department", "Warehouse"],
  inventory: ["Warehouse"],
  stock_adjustments: ["Warehouse"],
  material_transfers: ["Warehouse", "Production Department"],
  recipes: ["Production Department"],
  production: ["Production Department"],
  wastage: ["Production Department", "Warehouse"],
  finished_goods: ["Warehouse", "Production Department"],
  stock_transfers: ["Warehouse", "Sales"],
  sales: ["Sales"],
  customers: ["Sales", "Accounts"],
  customer_payments: ["Accounts", "Sales"],
  sales_returns: ["Sales"],
  reports: [],
  users: [],
  settings: [],
  audit: [],
};

const ADMIN_ONLY: ModuleKey[] = ["users", "settings"];

export function canManage(role: RoleKey, module: ModuleKey): boolean {
  if (role === "View only") return false;
  if (role === "Administrator") return true;
  // Managers are operational super-users. Keep user/security configuration
  // administrator-only, but allow managers to create and post everywhere else.
  if (role === "Manager") return !ADMIN_ONLY.includes(module);
  if (ADMIN_ONLY.includes(module)) return false;
  return MANAGE[module]?.includes(role) ?? false;
}

export function modulesForRole(role: RoleKey): ModuleKey[] {
  if (role === "View only") return MODULES.filter((module) => !ADMIN_ONLY.includes(module));
  return MODULES.filter((module) => canManage(role, module));
}

export function canView(role: RoleKey, module: ModuleKey): boolean {
  if (role === "Administrator" || role === "Manager" || role === "View only") return true;
  if (ADMIN_ONLY.includes(module)) return false;
  return true;
}

export function denyReason(role: RoleKey, module: ModuleKey) {
  return `${role} role does not have permission to modify this module.`;
}

export const ROUTE_MODULES: ReadonlyArray<readonly [string, ModuleKey]> = (
  [
    ["/inventory/raw-materials", "raw_materials"],
    ["/inventory/finished-goods", "finished_goods"],
    ["/inventory/stock-ledger", "inventory"],
    ["/inventory/adjustments", "stock_adjustments"],
    ["/inventory/locations", "inventory"],
    ["/production/transfers", "material_transfers"],
    ["/production/recipes", "recipes"],
    ["/production/batches", "production"],
    ["/production/wastage", "wastage"],
    ["/purchasing/invoices", "purchasing"],
    ["/purchasing/suppliers", "suppliers"],
    ["/purchasing/payments", "supplier_payments"],
    ["/sales/invoices", "sales"],
    ["/sales/customers", "customers"],
    ["/sales/payments", "customer_payments"],
    ["/sales/returns", "sales_returns"],
    ["/stock-transfers", "stock_transfers"],
    ["/dashboard", "dashboard"],
    ["/products", "finished_goods"],
    ["/reports", "reports"],
    ["/audit", "audit"],
    ["/users", "users"],
    ["/settings", "settings"],
  ] as Array<readonly [string, ModuleKey]>
).sort((left, right) => right[0].length - left[0].length);

export function moduleForPath(pathname: string): ModuleKey | null {
  return (
    ROUTE_MODULES.find(
      ([prefix]) => pathname === prefix || pathname.startsWith(`${prefix}/`),
    )?.[1] ?? null
  );
}

export function firstAllowedPath(can: (module: ModuleKey) => boolean): string {
  const preferred: ModuleKey[] = [
    "dashboard",
    ...MODULES.filter((module) => module !== "dashboard"),
  ];
  const allowed = preferred.find(can);
  return ROUTE_MODULES.find(([, module]) => module === allowed)?.[0] ?? "/login";
}
