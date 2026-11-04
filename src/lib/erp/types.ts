export type ID = string;

export type LocationType =
  "raw_warehouse" | "production" | "fg_warehouse" | "branch" | "shop" | "van" | "virtual";

export interface Location {
  id: ID;
  code: string;
  name: string;
  type: LocationType;
  address?: string;
  active: boolean;
}

export interface Category {
  id: ID;
  name: string;
  kind: "RM" | "FG";
  active?: boolean;
}
export interface Uom {
  id: ID;
  code: string;
  name: string;
  active?: boolean;
}
export interface TaxRate {
  id: ID;
  name: string;
  rate: number;
  active?: boolean;
}
export interface PaymentMethod {
  id: ID;
  name: string;
  active?: boolean;
}
export interface Employee {
  id: ID;
  code: string;
  name: string;
  role: RoleKey;
  department: string;
  active: boolean;
}

export interface Supplier {
  id: ID;
  code: string;
  name: string;
  contact: string;
  phone: string;
  email: string;
  address: string;
  vat: string;
  openingBalance: number;
  paymentTerms: string;
  creditLimit: number;
  active: boolean;
  notes?: string;
}

export interface Customer {
  id: ID;
  code: string;
  name: string;
  contact: string;
  phone: string;
  email: string;
  address: string;
  type: string;
  vat: string;
  openingBalance: number;
  creditLimit: number;
  paymentTerms: string;
  branchId: ID;
  active: boolean;
  notes?: string;
}

export interface RawMaterial {
  id: ID;
  code: string;
  name: string;
  categoryId: ID;
  baseUnit: string;
  purchaseUnit: string;
  consumptionUnit: string;
  conversionFactor: number;
  standardCost: number;
  minStock: number;
  reorderLevel: number;
  taxRate: number;
  active: boolean;
}

export interface Product {
  id: ID;
  code: string;
  name: string;
  categoryId: ID;
  salesUnit: string;
  price: number;
  standardCost: number;
  minStock: number;
  taxRate: number;
  barcode: string;
  shelfLifeDays: number;
  active: boolean;
}

export type DocStatus =
  | "Draft"
  | "Submitted"
  | "Approved"
  | "Posted"
  | "Planned"
  | "In Progress"
  | "Completed"
  | "Dispatched"
  | "In Transit"
  | "Received"
  | "Partially Received"
  | "Paid"
  | "Partially Paid"
  | "Overdue"
  | "Cancelled";

export interface PurchaseLine {
  itemId: ID;
  qty: number;
  unit: string;
  rate: number;
  discount: number;
  taxRate: number;
}
export interface PurchaseInvoice {
  id: ID;
  no: string;
  supplierId: ID;
  supplierInvNo: string;
  date: string;
  dueDate: string;
  warehouseId: ID;
  paymentTerms: string;
  notes?: string;
  lines: PurchaseLine[];
  status: DocStatus;
  createdBy: string;
  createdAt: string;
  cancelReason?: string;
}

export interface Allocation {
  invoiceId: ID;
  amount: number;
}
export interface Payment {
  id: ID;
  no: string;
  partyId: ID;
  date: string;
  amount: number;
  method: string;
  reference: string;
  account: string;
  allocations: Allocation[];
  notes?: string;
  createdBy: string;
  status: DocStatus;
}

export interface MaterialTransfer {
  id: ID;
  no: string;
  date: string;
  fromId: ID;
  toId: ID;
  requestedBy: string;
  approvedBy?: string;
  notes?: string;
  lines: {
    id?: ID;
    itemId: ID;
    qty: number;
    unit: string;
    dispatchedQty?: number;
    receivedQty?: number;
    damagedQty?: number;
  }[];
  status: DocStatus;
  createdBy: string;
}

export interface Recipe {
  id: ID;
  no: string;
  productId: ID;
  outputQty: number;
  outputUnit: string;
  version: string;
  effectiveDate: string;
  status: "Draft" | "Active" | "Inactive" | "Archived";
  notes?: string;
  lines: { itemId: ID; qty: number; unit: string; wastagePct: number }[];
}

export interface ProductionBatch {
  id: ID;
  no: string;
  productId: ID;
  recipeId: ID;
  recipeVersion: string;
  plannedQty: number;
  producedQty: number;
  batchNo: string;
  date: string;
  expiryDate: string;
  productionLocationId: ID;
  fgLocationId: ID;
  supervisor: string;
  remarks?: string;
  materials: { itemId: ID; stdQty: number; actualQty: number; unitCost: number }[];
  status: DocStatus;
  createdBy: string;
}

export interface Wastage {
  id: ID;
  no: string;
  date: string;
  batchId?: ID;
  itemId: ID;
  itemType: "RM" | "FG";
  qty: number;
  unit: string;
  locationId: ID;
  wastageType: string;
  reason: string;
  approvedBy: string;
  status: DocStatus;
  createdBy: string;
}

export interface StockTransfer {
  id: ID;
  no: string;
  date: string;
  fromId: ID;
  toId: ID;
  dispatchDate?: string;
  expectedDate?: string;
  receivedDate?: string;
  requestedBy: string;
  dispatchedBy?: string;
  receivedBy?: string;
  notes?: string;
  lines: {
    id?: ID;
    itemId: ID;
    batch: string;
    qty: number;
    receivedQty?: number;
    damagedQty?: number;
  }[];
  status: DocStatus;
  createdBy: string;
}

export interface SalesLine {
  id?: ID;
  itemId: ID;
  batch: string;
  qty: number;
  price: number;
  discount: number;
  taxRate: number;
  cost: number;
}
export interface SalesInvoice {
  id: ID;
  no: string;
  customerId: ID;
  date: string;
  dueDate: string;
  locationId: ID;
  paymentTerms: string;
  salesperson: string;
  notes?: string;
  lines: SalesLine[];
  status: DocStatus;
  createdBy: string;
  cancelReason?: string;
}

export interface SalesReturn {
  id: ID;
  no: string;
  customerId: ID;
  invoiceId: ID;
  date: string;
  locationId: ID;
  reason: string;
  notes?: string;
  lines: {
    itemId: ID;
    batch: string;
    qty: number;
    condition: "Saleable" | "Damaged" | "Expired" | "Quality Issue";
    amount: number;
  }[];
  status: DocStatus;
  createdBy: string;
}

export interface StockAdjustment {
  id: ID;
  no: string;
  date: string;
  locationId: ID;
  itemId: ID;
  itemType: "RM" | "FG";
  batch: string;
  expiryDate?: string;
  qty: number;
  reason: string;
  status: DocStatus;
  createdBy: string;
}

export interface OpeningStock extends StockAdjustment {
  unitCost: number;
  notes: string;
}

export interface AuditEntry {
  id: ID;
  ts: string;
  user: string;
  action: string;
  module: string;
  recordType: string;
  recordNo: string;
  prevStatus?: string;
  newStatus?: string;
  description: string;
}

export type RoleKey =
  | "Administrator"
  | "Purchase Department"
  | "Production Department"
  | "Warehouse"
  | "Sales"
  | "Accounts"
  | "Manager"
  | "View only";

export type ModuleKey =
  | "dashboard"
  | "purchasing"
  | "suppliers"
  | "supplier_payments"
  | "raw_materials"
  | "inventory"
  | "stock_adjustments"
  | "material_transfers"
  | "recipes"
  | "production"
  | "wastage"
  | "finished_goods"
  | "stock_transfers"
  | "sales"
  | "customers"
  | "customer_payments"
  | "sales_returns"
  | "reports"
  | "users"
  | "settings"
  | "audit";

export interface AppUser {
  id: ID;
  name: string;
  role: RoleKey;
  email: string;
  active: boolean;
  modules?: ModuleKey[];
  username?: string;
  passwordHash?: string;
  passwordSalt?: string;
  credentialState?: "initial-admin" | "ready" | "password-required";
  mustChangePassword?: boolean;
}

export interface LedgerEntry {
  id: string;
  ts: string;
  txnNo: string;
  type: string;
  refType: string;
  refId: ID;
  refNo: string;
  itemId: ID;
  itemType: "RM" | "FG";
  batch: string;
  locationId: ID;
  fromId?: ID;
  toId?: ID;
  qtyIn: number;
  qtyOut: number;
  unitCost: number;
  value: number;
  user: string;
  status: string;
}

export interface Database {
  locations: Location[];
  categories: Category[];
  uoms: Uom[];
  taxRates: TaxRate[];
  paymentMethods: PaymentMethod[];
  employees: Employee[];
  suppliers: Supplier[];
  customers: Customer[];
  rawMaterials: RawMaterial[];
  products: Product[];
  purchaseInvoices: PurchaseInvoice[];
  supplierPayments: Payment[];
  materialTransfers: MaterialTransfer[];
  recipes: Recipe[];
  productionBatches: ProductionBatch[];
  wastages: Wastage[];
  stockTransfers: StockTransfer[];
  salesInvoices: SalesInvoice[];
  customerPayments: Payment[];
  salesReturns: SalesReturn[];
  stockAdjustments: StockAdjustment[];
  openingStocks: OpeningStock[];
  stockLedger?: LedgerEntry[];
  audit: AuditEntry[];
  users: AppUser[];
  counters: Record<string, number>;
}
