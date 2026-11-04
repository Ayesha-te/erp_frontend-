import {
  Boxes,
  ClipboardList,
  Monitor,
  Factory,
  FileBarChart2,
  LayoutDashboard,
  Package,
  PackageSearch,
  Receipt,
  RefreshCcw,
  Settings,
  ShieldCheck,
  ShoppingCart,
  Truck,
  Users,
  Wallet,
  Wheat,
  Undo2,
  BookOpen,
  MapPin,
  Trash2,
  SlidersHorizontal,
  ScrollText,
  UserCog,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ModuleKey } from "@/lib/erp/permissions";

export interface NavItem {
  label: string;
  to: string;
  icon: LucideIcon;
  module?: ModuleKey;
}
export interface NavGroup {
  label: string;
  icon: LucideIcon;
  items: NavItem[];
}
export type NavEntry = NavItem | NavGroup;

export const isGroup = (e: NavEntry): e is NavGroup => "items" in e;

export const NAV: NavEntry[] = [
  { label: "Dashboard", to: "/dashboard", icon: LayoutDashboard, module: "dashboard" },
  {
    label: "Purchasing",
    icon: ShoppingCart,
    items: [
      {
        label: "Purchase Invoices",
        to: "/purchasing/invoices",
        icon: Receipt,
        module: "purchasing",
      },
      { label: "Suppliers", to: "/purchasing/suppliers", icon: Users, module: "suppliers" },
      {
        label: "Supplier Payments",
        to: "/purchasing/payments",
        icon: Wallet,
        module: "supplier_payments",
      },
    ],
  },
  {
    label: "Inventory",
    icon: Boxes,
    items: [
      {
        label: "Raw Materials",
        to: "/inventory/raw-materials",
        icon: Wheat,
        module: "raw_materials",
      },
      {
        label: "Finished Goods",
        to: "/inventory/finished-goods",
        icon: Package,
        module: "finished_goods",
      },
      {
        label: "FG Display",
        to: "/display",
        icon: Monitor,
        module: "inventory",
      },
      {
        label: "RM Display",
        to: "/display-raw-materials",
        icon: Monitor,
        module: "inventory",
      },
      {
        label: "Location Display",
        to: "/display-locations",
        icon: MapPin,
        module: "inventory",
      },
      {
        label: "Stock Ledger",
        to: "/inventory/stock-ledger",
        icon: ScrollText,
        module: "inventory",
      },
      {
        label: "Stock Adjustments",
        to: "/inventory/adjustments",
        icon: SlidersHorizontal,
        module: "stock_adjustments",
      },
      { label: "Locations", to: "/inventory/locations", icon: MapPin, module: "inventory" },
    ],
  },
  {
    label: "Production",
    icon: Factory,
    items: [
      {
        label: "Material Transfers",
        to: "/production/transfers",
        icon: Truck,
        module: "material_transfers",
      },
      { label: "Recipes", to: "/production/recipes", icon: BookOpen, module: "recipes" },
      {
        label: "Production Runs",
        to: "/production/batches",
        icon: ClipboardList,
        module: "production",
      },
      { label: "Wastage", to: "/production/wastage", icon: Trash2, module: "wastage" },
    ],
  },
  { label: "Stock Transfers", to: "/stock-transfers", icon: RefreshCcw, module: "stock_transfers" },
  {
    label: "Sales",
    icon: PackageSearch,
    items: [
      { label: "Sales Invoices", to: "/sales/invoices", icon: Receipt, module: "sales" },
      { label: "Customers", to: "/sales/customers", icon: Users, module: "customers" },
      {
        label: "Customer Payments",
        to: "/sales/payments",
        icon: Wallet,
        module: "customer_payments",
      },
      { label: "Sales Returns", to: "/sales/returns", icon: Undo2, module: "sales_returns" },
    ],
  },
  { label: "Products", to: "/products", icon: Package, module: "finished_goods" },
  { label: "Reports", to: "/reports", icon: FileBarChart2, module: "reports" },
  { label: "Audit Trail", to: "/audit", icon: ShieldCheck, module: "audit" },
  { label: "Users & Roles", to: "/users", icon: UserCog, module: "users" },
  { label: "Settings", to: "/settings", icon: Settings, module: "settings" },
];

export const QUICK_CREATE: { label: string; to: string; module: ModuleKey }[] = [
  { label: "Purchase Invoice", to: "/purchasing/invoices", module: "purchasing" },
  { label: "Material Transfer", to: "/production/transfers", module: "material_transfers" },
  { label: "Production Run", to: "/production/batches", module: "production" },
  { label: "Stock Transfer", to: "/stock-transfers", module: "stock_transfers" },
  { label: "Sales Invoice", to: "/sales/invoices", module: "sales" },
  { label: "Sales Return", to: "/sales/returns", module: "sales_returns" },
  { label: "Customer Payment", to: "/sales/payments", module: "customer_payments" },
  { label: "Supplier Payment", to: "/purchasing/payments", module: "supplier_payments" },
];
