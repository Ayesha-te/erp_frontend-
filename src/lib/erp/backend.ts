import { API_ENDPOINTS, apiJson, apiList, getBakeryCode, setApiTokens, setBakery, type ApiTokens } from "@/lib/api";
import { buildSeed } from "./seed";
import { modulesForRole } from "./permissions";
import type { AppUser, Database, DocStatus, LedgerEntry, LocationType, ModuleKey, RoleKey } from "./types";

type AnyRecord = Record<string, unknown>;
export type BackendMasterKind =
  "supplier" | "customer" | "location" | "rawMaterial" | "product" | "recipe";

const collectionEndpoints: Partial<Record<keyof Database, string>> = {
  locations: API_ENDPOINTS.locations,
  suppliers: API_ENDPOINTS.suppliers,
  customers: API_ENDPOINTS.customers,
  categories: API_ENDPOINTS.categories,
  uoms: API_ENDPOINTS.units,
  taxRates: API_ENDPOINTS.taxRates,
  paymentMethods: API_ENDPOINTS.paymentMethods,
  rawMaterials: API_ENDPOINTS.rawMaterials,
  products: API_ENDPOINTS.finishedProducts,
  purchaseInvoices: API_ENDPOINTS.purchases,
  supplierPayments: API_ENDPOINTS.supplierPayments,
  customerPayments: API_ENDPOINTS.customerPayments,
  materialTransfers: API_ENDPOINTS.materialTransfers,
  recipes: API_ENDPOINTS.recipes,
  productionBatches: API_ENDPOINTS.productionBatches,
  wastages: API_ENDPOINTS.wastage,
  stockTransfers: API_ENDPOINTS.finishedGoodsTransfers,
  salesInvoices: API_ENDPOINTS.salesInvoices,
  salesReturns: API_ENDPOINTS.salesReturns,
  stockAdjustments: API_ENDPOINTS.stockAdjustment,
};

export function backendEndpointForCollection(collection: keyof Database) {
  return collectionEndpoints[collection];
}

export async function deleteBackendRecord(collection: keyof Database, id: string) {
  const endpoint = backendEndpointForCollection(collection);
  // Browser-local fallback records can have readable IDs such as PI-N...
  // rather than backend UUIDs. They do not have REST detail resources.
  const isBackendUuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
  if (!endpoint) return false;
  if (!isBackendUuid) throw new Error("This record does not have a backend ID.");
  try {
    await apiJson(`${endpoint}${encodeURIComponent(id)}/`, { method: "DELETE" });
  } catch (error) {
    // A stale snapshot can contain a UUID that was already removed by another
    // user. Deletion is idempotent: absent from the backend is already success.
    if ((error as { status?: number })?.status !== 404) throw error;
  }
  return true;
}

export function backendCollectionWritable(collection: keyof Database) {
  return Boolean(backendEndpointForCollection(collection));
}

async function apiListIfAllowed<T>(path: string): Promise<T[]> {
  try {
    return await apiList<T>(path);
  } catch (error) {
    if ((error as { status?: number })?.status === 403) return [];
    throw error;
  }
}

function backendStatus(value: unknown) {
  return s(value).toUpperCase().replaceAll(" ", "_") || "DRAFT";
}

function backendPaymentMethod(value: unknown, db: Database) {
  return db.paymentMethods.find((method) => method.id === s(value) || method.name === s(value))?.id;
}

function itemPayload(record: AnyRecord, db: Database) {
  const itemType = record.itemType === "FG" || record.finished_product ? "FG" : "RM";
  return {
    raw_material: itemType === "RM" ? record.itemId || record.raw_material : null,
    finished_product: itemType === "FG" ? record.itemId || record.finished_product : null,
  };
}

export function backendPayloadForCollection(
  collection: keyof Database,
  record: AnyRecord,
  db: Database,
  mode: "create" | "update",
): AnyRecord {
  const withNumber = (prefix: string, value: unknown) =>
    s(value) || `${prefix}-${new Date().toISOString().replace(/\D/g, "").slice(2, 14)}`;

  if (collection === "locations") {
    return {
      code: record.code,
      name: record.name,
      location_type: backendLocationType(s(record.type)),
      address: record.address || "",
      is_sales_location: ["branch", "shop", "van"].includes(s(record.type)),
      is_inventory_location: true,
      is_production_location: record.type === "production",
      is_active: record.active !== false,
    };
  }
  if (collection === "suppliers") {
    return {
      supplier_code: record.code,
      name: record.name,
      contact_person: record.contact || "",
      phone: record.phone || "",
      email: record.email || "",
      address: record.address || "",
      vat_number: record.vat || "",
      opening_balance: n(record.openingBalance),
      payment_terms_days: termsDays(s(record.paymentTerms)),
      credit_limit: n(record.creditLimit),
      notes: record.notes || "",
      status: record.active === false ? "INACTIVE" : "ACTIVE",
    };
  }
  if (collection === "customers") {
    return {
      customer_code: record.code,
      name: record.name,
      contact_person: record.contact || "",
      phone: record.phone || "",
      email: record.email || "",
      address: record.address || "",
      customer_type: record.type || "Retail",
      vat_number: record.vat || "",
      opening_balance: n(record.openingBalance),
      credit_limit: n(record.creditLimit),
      payment_terms_days: termsDays(s(record.paymentTerms)),
      assigned_location: record.branchId || null,
      notes: record.notes || "",
      status: record.active === false ? "INACTIVE" : "ACTIVE",
    };
  }
  if (collection === "categories") return { name: record.name, kind: record.kind, status: record.active === false ? "INACTIVE" : "ACTIVE" };
  if (collection === "uoms") return { code: record.code, name: record.name, status: record.active === false ? "INACTIVE" : "ACTIVE" };
  if (collection === "taxRates") return { name: record.name, rate: n(record.rate), status: record.active === false ? "INACTIVE" : "ACTIVE" };
  if (collection === "paymentMethods") return { name: record.name, status: record.active === false ? "INACTIVE" : "ACTIVE" };
  if (collection === "rawMaterials") {
    const unit = unitId(s(record.baseUnit || record.purchaseUnit || record.consumptionUnit), db);
    return {
      material_code: record.code,
      name: record.name,
      category: record.categoryId,
      base_unit: unit,
      purchase_unit: unitId(s(record.purchaseUnit || unit), db),
      consumption_unit: unitId(s(record.consumptionUnit || unit), db),
      conversion_factor: n(record.conversionFactor) || 1,
      current_average_cost: n(record.standardCost),
      minimum_stock: n(record.minStock),
      reorder_level: n(record.reorderLevel),
      tax_rate: null,
      status: record.active === false ? "INACTIVE" : "ACTIVE",
    };
  }
  if (collection === "products") {
    return {
      product_code: record.code,
      name: record.name,
      category: record.categoryId,
      sales_unit: unitId(s(record.salesUnit), db),
      standard_sales_price: n(record.price),
      standard_cost: n(record.standardCost),
      minimum_stock: n(record.minStock),
      tax_rate: null,
      barcode: record.barcode || null,
      shelf_life_days: n(record.shelfLifeDays),
      status: record.active === false ? "INACTIVE" : "ACTIVE",
    };
  }
  if (collection === "purchaseInvoices") {
    return {
      invoice_number: withNumber("PI", record.no),
      supplier: record.supplierId,
      supplier_invoice_number: record.supplierInvNo || "",
      invoice_date: record.date,
      due_date: record.dueDate || null,
      warehouse: record.warehouseId,
      notes: record.notes || "",
      items: ((record.lines as AnyRecord[] | undefined) ?? []).map((line) => ({
        raw_material: line.itemId,
        quantity: n(line.qty),
        unit: unitId(s(line.unit), db),
        purchase_rate: n(line.rate),
        discount_amount: n(line.discount),
        tax_rate: n(line.taxRate),
      })),
    };
  }
  if (collection === "recipes") {
    return {
      recipe_number: withNumber("REC", record.no),
      finished_product: record.productId,
      standard_output_quantity: n(record.outputQty),
      output_unit: unitId(s(record.outputUnit), db),
      version: record.version,
      effective_date: record.effectiveDate,
      status: backendStatus(record.status),
      is_default: record.status === "Active",
      notes: record.notes || "",
      items: ((record.lines as AnyRecord[] | undefined) ?? []).map((line) => ({
        raw_material: line.itemId,
        required_quantity: n(line.qty),
        unit: unitId(s(line.unit), db),
        wastage_percentage: n(line.wastagePct),
      })),
    };
  }
  if (collection === "productionBatches") {
    return {
      production_number: withNumber("PRD", record.no),
      finished_product: record.productId,
      recipe: record.recipeId,
      planned_quantity: n(record.plannedQty),
      actual_produced_quantity: n(record.producedQty),
      production_location: record.productionLocationId,
      finished_goods_destination: record.fgLocationId,
      batch_number: record.batchNo || withNumber("BATCH", ""),
      manufacturing_date: record.date,
      expiry_date: record.expiryDate || null,
      supervisor: record.supervisor || null,
      remarks: record.remarks || "",
    };
  }
  if (collection === "salesInvoices") {
    return {
      invoice_number: withNumber("SI", record.no),
      customer: record.customerId,
      invoice_date: record.date,
      due_date: record.dueDate || null,
      sales_location: record.locationId,
      payment_terms: record.paymentTerms || "",
      salesperson: record.salesperson || null,
      notes: record.notes || "",
      items: ((record.lines as AnyRecord[] | undefined) ?? []).map((line) => ({
        finished_product: line.itemId,
        batch: line.batch || "",
        quantity: n(line.qty),
        unit: unitId(s(db.products.find((product) => product.id === line.itemId)?.salesUnit), db),
        selling_price: n(line.price),
        discount_amount: n(line.discount),
        tax_rate: n(line.taxRate),
      })),
    };
  }
  if (collection === "stockAdjustments") {
    return {
      adjustment_date: record.date,
      location: record.locationId,
      ...itemPayload(record, db),
      quantity: Math.abs(n(record.qty)),
      direction: n(record.qty) < 0 ? "NEGATIVE" : "POSITIVE",
      unit: unitId(s(db.rawMaterials.find((item) => item.id === record.itemId)?.baseUnit || db.products.find((item) => item.id === record.itemId)?.salesUnit), db),
      unit_cost: 0,
      reason: record.reason || "Stock adjustment",
      notes: record.notes || "",
    };
  }
  if (collection === "wastages") {
    return {
      wastage_date: record.date,
      location: record.locationId,
      ...itemPayload(record, db),
      quantity: n(record.qty),
      unit: unitId(s(record.unit), db),
      reason: record.reason || "Wastage",
      notes: record.wastageType || record.notes || "",
    };
  }
  if (collection === "materialTransfers") {
    return {
      transfer_date: record.date,
      source_location: record.fromId,
      destination_location: record.toId,
      notes: record.notes || "",
      items: ((record.lines as AnyRecord[] | undefined) ?? []).map((line) => ({
        raw_material: line.itemId,
        quantity: n(line.qty),
        unit: unitId(s(line.unit), db),
      })),
    };
  }
  if (collection === "stockTransfers") {
    return {
      transfer_date: record.date,
      source_location: record.fromId,
      destination_location: record.toId,
      dispatch_date: record.dispatchDate || null,
      expected_receipt_date: record.expectedDate || null,
      received_date: record.receivedDate || null,
      notes: record.notes || "",
      items: ((record.lines as AnyRecord[] | undefined) ?? []).map((line) => ({
        finished_product: line.itemId,
        batch: line.batch || "",
        requested_quantity: n(line.qty),
        unit: unitId(s(db.products.find((product) => product.id === line.itemId)?.salesUnit), db),
      })),
    };
  }
  if (collection === "supplierPayments" || collection === "customerPayments") {
    const isSupplier = collection === "supplierPayments";
    return {
      [isSupplier ? "supplier" : "customer"]: record.partyId,
      payment_date: record.date,
      amount: n(record.amount),
      payment_method: backendPaymentMethod(record.method, db),
      reference_number: record.reference || "",
      notes: record.notes || "",
      allocations: ((record.allocations as AnyRecord[] | undefined) ?? []).map((allocation) => ({
        invoice: allocation.invoiceId,
        amount: n(allocation.amount),
      })),
    };
  }
  if (collection === "salesReturns") {
    return {
      original_sales_invoice: record.invoiceId,
      return_date: record.date,
      return_location: record.locationId,
      reason: record.reason,
      notes: record.notes || "",
    };
  }
  if (mode === "create") throw new Error(`Creating ${String(collection)} through the API is not supported.`);
  throw new Error(`Editing ${String(collection)} through the API is not supported.`);
}

export async function updateBackendRecord(collection: keyof Database, id: string, record: AnyRecord, db: Database) {
  const endpoint = backendEndpointForCollection(collection);
  if (!endpoint) throw new Error(`No backend endpoint is configured for ${String(collection)}.`);
  await apiJson(`${endpoint}${encodeURIComponent(id)}/`, {
    method: "PATCH",
    body: JSON.stringify(backendPayloadForCollection(collection, record, db, "update")),
  });
}

export async function createBackendRecord(collection: keyof Database, record: AnyRecord, db: Database) {
  const endpoint = backendEndpointForCollection(collection);
  if (!endpoint) throw new Error(`No backend endpoint is configured for ${String(collection)}.`);
  return apiJson(endpoint, {
    method: "POST",
    body: JSON.stringify(backendPayloadForCollection(collection, record, db, "create")),
  });
}

interface LoginResponse extends ApiTokens {
  user: BackendUser;
}

interface BackendUser {
  id: string;
  email: string;
  full_name: string;
  employee_code: string;
  role: string;
  department?: string;
  assigned_location?: string | null;
  allowed_modules?: ModuleKey[];
  is_active: boolean;
}

function n(value: unknown): number {
  if (value === null || value === undefined || value === "") return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function s(value: unknown): string {
  return value === null || value === undefined ? "" : String(value);
}

function active(record: AnyRecord): boolean {
  if ("is_active" in record) return Boolean(record.is_active);
  return record.status !== "INACTIVE";
}

function status(value: unknown): DocStatus {
  const label = s(value)
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
  return (label || "Draft") as DocStatus;
}

function recipeStatus(value: unknown): "Draft" | "Active" | "Inactive" | "Archived" {
  const normalized = status(value);
  if (["Draft", "Active", "Inactive", "Archived"].includes(normalized)) {
    return normalized as "Draft" | "Active" | "Inactive" | "Archived";
  }
  return "Draft";
}

function role(value: unknown): RoleKey {
  const map: Record<string, RoleKey> = {
    ADMINISTRATOR: "Administrator",
    PURCHASE: "Purchase Department",
    PRODUCTION: "Production Department",
    WAREHOUSE: "Warehouse",
    SALES: "Sales",
    ACCOUNTS: "Accounts",
    MANAGER: "Manager",
    VIEW_ONLY: "View only",
  };
  return map[s(value)] ?? "Manager";
}

export function backendRole(value: RoleKey) {
  const map: Record<RoleKey, string> = {
    Administrator: "ADMINISTRATOR",
    "Purchase Department": "PURCHASE",
    "Production Department": "PRODUCTION",
    Warehouse: "WAREHOUSE",
    Sales: "SALES",
    Accounts: "ACCOUNTS",
    Manager: "MANAGER",
    "View only": "VIEW_ONLY",
  };
  return map[value];
}

function locationType(value: unknown): LocationType {
  const map: Record<string, LocationType> = {
    RAW_MATERIAL_WAREHOUSE: "raw_warehouse",
    PRODUCTION: "production",
    FINISHED_GOODS_WAREHOUSE: "fg_warehouse",
    SHOP: "shop",
    DELIVERY_VAN: "van",
    DAMAGED_GOODS: "virtual",
    IN_TRANSIT: "virtual",
    OTHER: "virtual",
  };
  return map[s(value)] ?? "virtual";
}

function unitName(id: unknown, units: Database["uoms"]) {
  return units.find((u) => u.id === s(id))?.code ?? s(id);
}

function unitId(codeOrId: string, db: Database) {
  return db.uoms.find((u) => u.id === codeOrId || u.code === codeOrId)?.id || codeOrId;
}

function termsDays(value: string) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

function backendLocationType(value: string) {
  const map: Record<string, string> = {
    raw_warehouse: "RAW_MATERIAL_WAREHOUSE",
    production: "PRODUCTION",
    fg_warehouse: "FINISHED_GOODS_WAREHOUSE",
    branch: "SHOP",
    shop: "SHOP",
    van: "DELIVERY_VAN",
    virtual: "OTHER",
  };
  return map[value] ?? "OTHER";
}

function mapUser(user: BackendUser): AppUser {
  const mappedRole = role(user.role);
  return {
    id: user.id,
    name: user.full_name,
    role: mappedRole,
    email: user.email,
    active: user.is_active,
    username: user.employee_code || user.email,
    modules: user.allowed_modules?.length ? user.allowed_modules : modulesForRole(mappedRole),
    credentialState: "ready",
  };
}

export async function backendLogin(email: string, password: string) {
  const response = await apiJson<LoginResponse>(API_ENDPOINTS.auth.login, {
    method: "POST",
    auth: false,
    body: JSON.stringify({ email, password }),
  });
  setApiTokens({ access: response.access, refresh: response.refresh });
  const bk = (response as { bakery?: { name?: string } }).bakery;
  if (bk?.name) setBakery(getBakeryCode(), bk.name);
  return mapUser(response.user);
}

export async function fetchCurrentBackendUser() {
  const response = await apiJson<{ success: boolean; data: BackendUser }>(API_ENDPOINTS.auth.me);
  return mapUser(response.data);
}

export async function createBackendUser(form: {
  name: string;
  email: string;
  employeeCode: string;
  role: RoleKey;
  modules: ModuleKey[];
  active: boolean;
  password: string;
}) {
  return apiJson<BackendUser>(API_ENDPOINTS.auth.users, {
    method: "POST",
    body: JSON.stringify({
      email: form.email,
      full_name: form.name,
      employee_code: form.employeeCode,
      role: backendRole(form.role),
      department: form.role,
      assigned_location: null,
      can_access_all_locations: true,
      allowed_modules: form.modules,
      is_active: form.active,
      password: form.password,
    }),
  });
}

export async function updateBackendUserModules(id: string, modules: ModuleKey[]) {
  return apiJson<BackendUser>(`${API_ENDPOINTS.auth.users}${encodeURIComponent(id)}/`, {
    method: "PATCH",
    body: JSON.stringify({ allowed_modules: modules }),
  });
}

export async function resetBackendUserPassword(id: string, password: string) {
  return apiJson(`${API_ENDPOINTS.auth.users}${encodeURIComponent(id)}/reset-password/`, {
    method: "POST",
    body: JSON.stringify({ password }),
  });
}

export async function clearBackendBusinessData() {
  return apiJson<{ success: boolean; message: string; deleted: Record<string, number> }>(
    API_ENDPOINTS.clearBusinessData,
    { method: "POST" },
  );
}

export function removeRecordReferences(database: Database, collection: keyof Database, id: string) {
  const d = database;
  if (collection === "rawMaterials") {
    d.openingStocks = d.openingStocks.filter((x) => x.itemId !== id);
    d.stockAdjustments = d.stockAdjustments.filter((x) => x.itemId !== id);
    d.wastages = d.wastages.filter((x) => x.itemId !== id);
    d.purchaseInvoices.forEach((x) => {
      x.lines = x.lines.filter((l) => l.itemId !== id);
    });
    d.materialTransfers.forEach((x) => {
      x.lines = x.lines.filter((l) => l.itemId !== id);
    });
    d.recipes.forEach((x) => {
      x.lines = x.lines.filter((l) => l.itemId !== id);
    });
    d.productionBatches.forEach((x) => {
      x.materials = x.materials.filter((l) => l.itemId !== id);
    });
  }
  if (collection === "products") {
    d.openingStocks = d.openingStocks.filter((x) => x.itemId !== id);
    d.stockAdjustments = d.stockAdjustments.filter((x) => x.itemId !== id);
    d.wastages = d.wastages.filter((x) => x.itemId !== id);
    d.recipes = d.recipes.filter((x) => x.productId !== id);
    d.productionBatches = d.productionBatches.filter((x) => x.productId !== id);
    d.stockTransfers.forEach((x) => {
      x.lines = x.lines.filter((l) => l.itemId !== id);
    });
    d.salesInvoices.forEach((x) => {
      x.lines = x.lines.filter((l) => l.itemId !== id);
    });
    d.salesReturns.forEach((x) => {
      x.lines = x.lines.filter((l) => l.itemId !== id);
    });
  }
}

export async function createBackendMaster(
  kind: BackendMasterKind,
  form: Record<string, string>,
  db: Database,
  lines: { itemId: string; qty: number; unit: string; wastagePct: number }[] = [],
) {
  const number = (value: string) => n(value);
  const commonStatus = form.active === "false" ? "INACTIVE" : "ACTIVE";

  if (kind === "supplier") {
    return apiJson(API_ENDPOINTS.suppliers, {
      method: "POST",
      body: JSON.stringify({
        supplier_code: form.code.trim(),
        name: form.name.trim(),
        contact_person: form.contact,
        phone: form.phone,
        email: form.email,
        address: form.address,
        vat_number: form.vat,
        opening_balance: number(form.opening),
        payment_terms_days: termsDays(form.terms),
        credit_limit: number(form.credit),
        notes: "",
        status: commonStatus,
      }),
    });
  }

  if (kind === "customer") {
    return apiJson(API_ENDPOINTS.customers, {
      method: "POST",
      body: JSON.stringify({
        customer_code: form.code.trim(),
        name: form.name.trim(),
        contact_person: form.contact,
        phone: form.phone,
        email: form.email,
        address: form.address,
        customer_type: form.type || "Retail",
        vat_number: form.vat,
        opening_balance: number(form.opening),
        credit_limit: number(form.credit),
        payment_terms_days: termsDays(form.terms),
        assigned_location: form.branchId || null,
        notes: "",
        status: commonStatus,
      }),
    });
  }

  if (kind === "location") {
    return apiJson(API_ENDPOINTS.locations, {
      method: "POST",
      body: JSON.stringify({
        code: form.code.trim(),
        name: form.name.trim(),
        location_type: backendLocationType(form.type),
        address: form.address,
        is_sales_location: ["branch", "shop", "van"].includes(form.type),
        is_inventory_location: true,
        is_production_location: form.type === "production",
        is_active: form.active !== "false",
      }),
    });
  }

  if (kind === "rawMaterial") {
    const unit = unitId(form.unit, db);
    const material = await apiJson<{ id: string }>(API_ENDPOINTS.rawMaterials, {
      method: "POST",
      body: JSON.stringify({
        material_code: form.code.trim(),
        name: form.name.trim(),
        category: form.categoryId,
        base_unit: unit,
        purchase_unit: unit,
        consumption_unit: unit,
        conversion_factor: 1,
        current_average_cost: number(form.cost),
        minimum_stock: number(form.minStock),
        reorder_level: number(form.reorder),
        tax_rate: null,
        status: commonStatus,
      }),
    });
    const openingQuantity = number(form.openingStock);
    if (openingQuantity > 0) {
      await apiJson(API_ENDPOINTS.openingRawMaterial, {
        method: "POST",
        idempotent: true,
        body: JSON.stringify({
          raw_material: material.id,
          location: form.openingLocationId,
          quantity: openingQuantity,
        }),
      });
    }
    return material;
  }

  if (kind === "product") {
    return apiJson(API_ENDPOINTS.finishedProducts, {
      method: "POST",
      body: JSON.stringify({
        product_code: form.code.trim(),
        name: form.name.trim(),
        category: form.categoryId,
        sales_unit: unitId(form.unit, db),
        standard_sales_price: number(form.price),
        standard_cost: number(form.cost),
        minimum_stock: number(form.minStock),
        tax_rate: null,
        barcode: form.barcode || null,
        shelf_life_days: number(form.shelfLife),
        status: commonStatus,
      }),
    });
  }

  return apiJson(API_ENDPOINTS.recipes, {
    method: "POST",
    body: JSON.stringify({
      recipe_number: `REC-${Date.now().toString().slice(-6)}`,
      finished_product: form.productId,
      standard_output_quantity: number(form.outputQty),
      output_unit: unitId(form.unit, db),
      version: form.version,
      effective_date: form.effectiveDate,
      status: form.status.toUpperCase(),
      is_default: form.status === "Active",
      notes: "",
      items: lines.map((line) => ({
        raw_material: line.itemId,
        required_quantity: line.qty,
        unit: unitId(line.unit, db),
        wastage_percentage: line.wastagePct,
      })),
    }),
  });
}

export async function fetchBackendDatabase(currentUser?: AppUser | null): Promise<Database> {
  const seed = buildSeed();
  const [
    locations,
    suppliers,
    customers,
    categories,
    units,
    taxRates,
    paymentMethods,
    rawMaterials,
    products,
    purchases,
    recipes,
    productionBatches,
    salesInvoices,
    stockTransactions,
    auditLogs,
    customerPayments,
    supplierPayments,
    wastages,
    adjustments,
    materialTransfers,
    finishedGoodsTransfers,
    salesReturns,
    backendUsers,
  ] = await Promise.all([
    apiListIfAllowed<AnyRecord>(API_ENDPOINTS.locations),
    apiListIfAllowed<AnyRecord>(API_ENDPOINTS.suppliers),
    apiListIfAllowed<AnyRecord>(API_ENDPOINTS.customers),
    apiListIfAllowed<AnyRecord>(API_ENDPOINTS.categories),
    apiListIfAllowed<AnyRecord>(API_ENDPOINTS.units),
    apiListIfAllowed<AnyRecord>(API_ENDPOINTS.taxRates),
    apiListIfAllowed<AnyRecord>(API_ENDPOINTS.paymentMethods),
    apiListIfAllowed<AnyRecord>(API_ENDPOINTS.rawMaterials),
    apiListIfAllowed<AnyRecord>(API_ENDPOINTS.finishedProducts),
    apiListIfAllowed<AnyRecord>(API_ENDPOINTS.purchases),
    apiListIfAllowed<AnyRecord>(API_ENDPOINTS.recipes),
    apiListIfAllowed<AnyRecord>(API_ENDPOINTS.productionBatches),
    apiListIfAllowed<AnyRecord>(API_ENDPOINTS.salesInvoices),
    apiListIfAllowed<AnyRecord>(API_ENDPOINTS.stockTransactions),
    apiListIfAllowed<AnyRecord>(API_ENDPOINTS.auditLogs),
    !currentUser || currentUser.modules?.includes("customer_payments")
      ? apiListIfAllowed<AnyRecord>(API_ENDPOINTS.customerPayments)
      : Promise.resolve([]),
    !currentUser || currentUser.modules?.includes("supplier_payments")
      ? apiListIfAllowed<AnyRecord>(API_ENDPOINTS.supplierPayments)
      : Promise.resolve([]),
    apiListIfAllowed<AnyRecord>(API_ENDPOINTS.wastage),
    apiListIfAllowed<AnyRecord>(API_ENDPOINTS.stockAdjustment),
    apiListIfAllowed<AnyRecord>(API_ENDPOINTS.materialTransfers),
    apiListIfAllowed<AnyRecord>(API_ENDPOINTS.finishedGoodsTransfers),
    apiListIfAllowed<AnyRecord>(API_ENDPOINTS.salesReturns),
    currentUser?.modules?.includes("users")
      ? apiListIfAllowed<AnyRecord>(API_ENDPOINTS.auth.users)
      : Promise.resolve([]),
  ]);

  const mappedUnits = units.map((x) => ({
    id: s(x.id),
    code: s(x.code),
    name: s(x.name),
    active: active(x),
  }));

  const db: Database = {
    ...seed,
    locations: locations.map((x) => ({
      id: s(x.id),
      code: s(x.code),
      name: s(x.name),
      type: locationType(x.location_type),
      address: s(x.address),
      active: active(x),
    })),
    suppliers: suppliers.map((x) => ({
      id: s(x.id),
      code: s(x.supplier_code),
      name: s(x.name),
      contact: s(x.contact_person),
      phone: s(x.phone),
      email: s(x.email),
      address: s(x.address),
      vat: s(x.vat_number),
      openingBalance: n(x.opening_balance),
      paymentTerms: `${n(x.payment_terms_days)} Days`,
      creditLimit: n(x.credit_limit),
      active: active(x),
      notes: s(x.notes),
    })),
    customers: customers.map((x) => ({
      id: s(x.id),
      code: s(x.customer_code),
      name: s(x.name),
      contact: s(x.contact_person),
      phone: s(x.phone),
      email: s(x.email),
      address: s(x.address),
      type: s(x.customer_type),
      vat: s(x.vat_number),
      openingBalance: n(x.opening_balance),
      creditLimit: n(x.credit_limit),
      paymentTerms: `${n(x.payment_terms_days)} Days`,
      branchId: s(x.assigned_location),
      active: active(x),
      notes: s(x.notes),
    })),
    categories: categories.map((x) => ({
      id: s(x.id),
      name: s(x.name),
      kind: x.kind === "FG" ? "FG" : "RM",
      active: active(x),
    })),
    uoms: mappedUnits,
    taxRates: taxRates.map((x) => ({
      id: s(x.id),
      name: s(x.name),
      rate: n(x.rate),
      active: active(x),
    })),
    paymentMethods: paymentMethods.map((x) => ({
      id: s(x.id),
      name: s(x.name),
      active: active(x),
    })),
    employees: (backendUsers.length ? backendUsers : currentUser ? [currentUser] : []).map((x) => {
      const mapped = "full_name" in x ? mapUser(x as unknown as BackendUser) : (x as AppUser);
      return {
        id: mapped.id,
        code: "employee_code" in x ? s((x as AnyRecord).employee_code) : mapped.username || "",
        name: mapped.name,
        role: mapped.role,
        department: "department" in x ? s((x as AnyRecord).department) : mapped.role,
        active: mapped.active,
      };
    }),
    rawMaterials: rawMaterials.map((x) => ({
      id: s(x.id),
      code: s(x.material_code),
      name: s(x.name),
      categoryId: s(x.category),
      baseUnit: unitName(x.base_unit, mappedUnits),
      purchaseUnit: unitName(x.purchase_unit, mappedUnits),
      consumptionUnit: unitName(x.consumption_unit, mappedUnits),
      conversionFactor: n(x.conversion_factor),
      standardCost: n(x.current_average_cost),
      minStock: n(x.minimum_stock),
      reorderLevel: n(x.reorder_level),
      taxRate: n(x.tax_rate),
      active: active(x),
    })),
    products: products.map((x) => ({
      id: s(x.id),
      code: s(x.product_code),
      name: s(x.name),
      categoryId: s(x.category),
      salesUnit: unitName(x.sales_unit, mappedUnits),
      price: n(x.standard_sales_price),
      standardCost: n(x.standard_cost),
      minStock: n(x.minimum_stock),
      taxRate: n(x.tax_rate),
      barcode: s(x.barcode),
      shelfLifeDays: n(x.shelf_life_days),
      active: active(x),
    })),
    purchaseInvoices: purchases.map((x) => ({
      id: s(x.id),
      no: s(x.invoice_number),
      supplierId: s(x.supplier),
      supplierInvNo: s(x.supplier_invoice_number),
      date: s(x.invoice_date),
      dueDate: s(x.due_date),
      warehouseId: s(x.warehouse),
      paymentTerms: "",
      notes: s(x.notes),
      lines: ((x.items as AnyRecord[] | undefined) ?? []).map((item) => ({
        id: s(item.id),
        itemId: s(item.raw_material),
        qty: n(item.quantity),
        unit: unitName(item.unit, mappedUnits),
        rate: n(item.purchase_rate),
        discount: n(item.discount_amount),
        taxRate: n(item.tax_rate),
      })),
      status: status(x.status),
      createdBy: s(x.created_by),
      createdAt: s(x.created_at),
    })),
    recipes: recipes.map((x) => ({
      id: s(x.id),
      no: s(x.recipe_number),
      productId: s(x.finished_product),
      outputQty: n(x.standard_output_quantity),
      outputUnit: unitName(x.output_unit, mappedUnits),
      version: s(x.version),
      effectiveDate: s(x.effective_date),
      status: recipeStatus(x.status),
      notes: s(x.notes),
      lines: ((x.items as AnyRecord[] | undefined) ?? []).map((item) => ({
        itemId: s(item.raw_material),
        qty: n(item.required_quantity),
        unit: unitName(item.unit, mappedUnits),
        wastagePct: n(item.wastage_percentage),
      })),
    })),
    productionBatches: productionBatches.map((x) => ({
      id: s(x.id),
      no: s(x.production_number),
      productId: s(x.finished_product),
      recipeId: s(x.recipe),
      recipeVersion: s(x.recipe_version),
      plannedQty: n(x.planned_quantity),
      producedQty: n(x.actual_produced_quantity),
      batchNo: s(x.batch_number),
      date: s(x.manufacturing_date),
      expiryDate: s(x.expiry_date),
      productionLocationId: s(x.production_location),
      fgLocationId: s(x.finished_goods_destination),
      supervisor: s(x.supervisor),
      remarks: s(x.remarks),
      materials: [],
      status: status(x.status),
      createdBy: s(x.created_by),
    })),
    salesInvoices: salesInvoices.map((x) => ({
      id: s(x.id),
      no: s(x.invoice_number),
      customerId: s(x.customer),
      date: s(x.invoice_date),
      dueDate: s(x.due_date),
      locationId: s(x.sales_location),
      paymentTerms: s(x.payment_terms),
      salesperson: s(x.salesperson),
      notes: s(x.notes),
      lines: ((x.items as AnyRecord[] | undefined) ?? []).map((item) => ({
        itemId: s(item.finished_product),
        batch: s(item.batch),
        qty: n(item.quantity),
        price: n(item.selling_price),
        discount: n(item.discount_amount),
        taxRate: n(item.tax_rate),
        cost: n(item.unit_cost_snapshot),
      })),
      status: status(x.status),
      createdBy: s(x.created_by),
    })),
    audit: auditLogs.map((x) => ({
      id: s(x.id),
      ts: s(x.created_at),
      user: s(x.user),
      action: s(x.action),
      module: s(x.module),
      recordType: s(x.record_type),
      recordNo: s(x.record_number),
      description: s(x.description),
    })),
    users: backendUsers.length
      ? backendUsers.map((x) =>
          mapUser({
            id: s(x.id),
            email: s(x.email),
            full_name: s(x.full_name),
            employee_code: s(x.employee_code),
            role: s(x.role),
            department: s(x.department),
            assigned_location: s(x.assigned_location),
            allowed_modules: (x.allowed_modules as ModuleKey[] | undefined) ?? [],
            is_active: active(x),
          }),
        )
      : currentUser
        ? [currentUser]
        : [],
  };

  db.stockAdjustments = adjustments.map((x) => ({
    id: s(x.id),
    no: s(x.adjustment_number),
    date: s(x.adjustment_date),
    locationId: s(x.location),
    itemId: s(x.raw_material || x.finished_product),
    itemType: x.raw_material ? "RM" : "FG",
    batch: "",
    qty: x.direction === "NEGATIVE" ? -n(x.quantity) : n(x.quantity),
    reason: s(x.reason),
    expiryDate: "",
    status: status(x.status),
    createdBy: s(x.created_by),
  }));

  db.wastages = wastages.map((x) => ({
    id: s(x.id),
    no: s(x.document_number),
    date: s(x.wastage_date),
    itemId: s(x.raw_material || x.finished_product),
    itemType: x.raw_material ? "RM" : "FG",
    qty: n(x.quantity),
    unit: unitName(x.unit, mappedUnits),
    locationId: s(x.location),
    wastageType: s(x.notes),
    reason: s(x.reason),
    approvedBy: s(x.approved_by),
    status: status(x.status),
    createdBy: s(x.created_by),
  }));

  db.materialTransfers = materialTransfers.map((x) => ({
    id: s(x.id),
    no: s(x.transfer_number),
    date: s(x.transfer_date),
    fromId: s(x.source_location),
    toId: s(x.destination_location),
    requestedBy: s(x.requested_by),
    approvedBy: s(x.approved_by),
    notes: s(x.notes),
    status: status(x.status),
    createdBy: s(x.created_by),
    lines: ((x.items as AnyRecord[] | undefined) ?? []).map((line) => ({
      id: s(line.id),
      itemId: s(line.raw_material),
      qty: n(line.quantity),
      unit: unitName(line.unit, mappedUnits),
      dispatchedQty: n(line.dispatched_quantity),
      receivedQty: n(line.received_quantity),
      damagedQty: n(line.damaged_quantity),
    })),
  }));
  db.stockTransfers = finishedGoodsTransfers.map((x) => ({
    id: s(x.id),
    no: s(x.transfer_number),
    date: s(x.transfer_date),
    fromId: s(x.source_location),
    toId: s(x.destination_location),
    dispatchDate: s(x.dispatch_date),
    expectedDate: s(x.expected_delivery_date),
    receivedDate: s(x.received_date),
    requestedBy: s(x.requested_by),
    dispatchedBy: s(x.dispatched_by),
    receivedBy: s(x.received_by),
    notes: s(x.notes),
    status: status(x.status),
    createdBy: s(x.created_by),
    lines: ((x.items as AnyRecord[] | undefined) ?? []).map((line) => ({
      id: s(line.id),
      itemId: s(line.finished_product),
      batch: s(line.batch),
      qty: n(line.requested_quantity),
      receivedQty: n(line.received_quantity),
      damagedQty: n(line.damaged_quantity),
    })),
  }));

  db.stockLedger = stockTransactions
    .flatMap((x) => {
      const qtyIn = n(x.quantity_in);
      const qtyOut = n(x.quantity_out);
      const locationId = qtyIn ? s(x.destination_location) : s(x.source_location);
      const itemId = s(x.raw_material || x.finished_product);
      if (!locationId || !itemId) return [];
      const entry: LedgerEntry = {
        id: s(x.id),
        ts: s(x.transaction_date),
        txnNo: s(x.transaction_number),
        type: s(x.transaction_type).replaceAll("_", " "),
        refType: s(x.reference_type),
        refId: s(x.reference_id),
        refNo: s(x.transaction_number),
        itemId,
        itemType: x.raw_material ? "RM" : "FG",
        batch: s(x.batch),
        locationId,
        fromId: s(x.source_location) || undefined,
        toId: s(x.destination_location) || undefined,
        qtyIn,
        qtyOut,
        unitCost: n(x.unit_cost),
        value: n(x.total_value),
        user: s(x.created_by),
        status: "Posted",
      };
      return [entry];
    });

  const productionMaterials = new Map<
    string,
    { itemId: string; stdQty: number; actualQty: number; unitCost: number }[]
  >();
  stockTransactions
    .filter((x) => s(x.transaction_type) === "PRODUCTION_CONSUMPTION" && s(x.raw_material))
    .forEach((x) => {
      const batchId = s(x.reference_id);
      const lines = productionMaterials.get(batchId) ?? [];
      const actualQty = n(x.quantity_out);
      lines.push({
        itemId: s(x.raw_material),
        stdQty: actualQty,
        actualQty,
        unitCost: n(x.unit_cost),
      });
      productionMaterials.set(batchId, lines);
    });
  db.productionBatches = db.productionBatches.map((batch) => ({
    ...batch,
    materials: productionMaterials.get(batch.id) ?? batch.materials,
  }));

  db.salesReturns = salesReturns.map((x) => ({
    id: s(x.id),
    no: s(x.return_number),
    customerId: s(x.customer),
    invoiceId: s(x.original_sales_invoice),
    date: s(x.return_date),
    locationId: s(x.return_location),
    reason: s(x.reason),
    notes: s(x.notes),
    status: status(x.status),
    createdBy: s(x.created_by),
    lines: ((x.items as AnyRecord[] | undefined) ?? []).map((line) => ({
      itemId: s(line.finished_product),
      batch: "",
      qty: n(line.return_quantity),
      condition: s(line.condition) === "SALEABLE" ? ("Saleable" as const) : ("Damaged" as const),
      amount: n(line.credit_amount),
    })),
  }));

  db.openingStocks = stockTransactions
    .filter((x) => s(x.transaction_type) === "OPENING_STOCK")
    .map((x) => ({
      id: s(x.id),
      no: s(x.transaction_number),
      date: s(x.transaction_date).slice(0, 10),
      locationId: s(x.destination_location),
      itemId: s(x.raw_material || x.finished_product),
      itemType: x.raw_material ? "RM" : "FG",
      batch: "",
      qty: n(x.quantity_in),
      unitCost: n(x.unit_cost),
      reason: "Opening stock",
      notes: s(x.remarks),
      status: "Posted",
      createdBy: s(x.created_by),
    }));

  const mapPayment = (x: AnyRecord, partyKey: "customer" | "supplier") => ({
    id: s(x.id),
    no: s(x.payment_number),
    partyId: s(x[partyKey]),
    date: s(x.payment_date),
    amount: n(x.amount),
    method: s(
      paymentMethods.find((m) => s(m.id) === s(x.payment_method))?.name || x.payment_method,
    ),
    reference: s(x.reference_number),
    account: "",
    allocations: ((x.allocations as AnyRecord[] | undefined) ?? []).map((allocation) => ({
      invoiceId: s(allocation.invoice),
      amount: n(allocation.amount),
    })),
    notes: s(x.notes),
    createdBy: s(x.created_by),
    status: status(x.status),
  });
  db.customerPayments = customerPayments.map((x) => mapPayment(x, "customer"));
  db.supplierPayments = supplierPayments.map((x) => mapPayment(x, "supplier"));

  return db;
}
