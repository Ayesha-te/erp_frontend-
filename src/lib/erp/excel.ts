import ExcelJS from "exceljs";
import type { Column } from "@/components/erp/DataTable";
import type { Database } from "./types";

const FALLBACK_FIELDS: Partial<Record<Exclude<keyof Database, "counters">, string[]>> = {
  locations: ["id", "code", "name", "type", "address", "active"],
  suppliers: [
    "id",
    "code",
    "name",
    "contact",
    "phone",
    "email",
    "address",
    "vatNo",
    "paymentTerms",
    "creditLimit",
    "active",
  ],
  customers: [
    "id",
    "code",
    "name",
    "contact",
    "phone",
    "email",
    "address",
    "vatNo",
    "branchId",
    "paymentTerms",
    "creditLimit",
    "active",
  ],
  categories: ["id", "name", "kind", "active"],
  uoms: ["id", "code", "name", "active"],
  taxRates: ["id", "name", "rate", "active"],
  paymentMethods: ["id", "name", "active"],
  rawMaterials: [
    "id",
    "code",
    "name",
    "categoryId",
    "baseUnit",
    "purchaseUnit",
    "consumptionUnit",
    "conversionFactor",
    "standardCost",
    "minStock",
    "reorderLevel",
    "taxRate",
    "active",
  ],
  products: [
    "id",
    "code",
    "name",
    "categoryId",
    "salesUnit",
    "price",
    "standardCost",
    "minStock",
    "reorderLevel",
    "taxRate",
    "barcode",
    "shelfLifeDays",
    "active",
  ],
  purchaseInvoices: [
    "id",
    "no",
    "supplierId",
    "date",
    "dueDate",
    "warehouseId",
    "lines",
    "status",
    "createdBy",
  ],
  recipes: [
    "id",
    "no",
    "productId",
    "outputQty",
    "outputUnit",
    "version",
    "effectiveDate",
    "status",
    "notes",
    "lines",
  ],
  productionBatches: [
    "id",
    "no",
    "productId",
    "recipeId",
    "recipeVersion",
    "plannedQty",
    "producedQty",
    "date",
    "productionLocationId",
    "fgLocationId",
    "supervisor",
    "remarks",
    "materials",
    "status",
    "createdBy",
  ],
  materialTransfers: [
    "id",
    "no",
    "date",
    "fromId",
    "toId",
    "notes",
    "lines",
    "status",
    "createdBy",
  ],
  stockTransfers: [
    "id",
    "no",
    "date",
    "fromId",
    "toId",
    "dispatchDate",
    "expectedDate",
    "receivedDate",
    "requestedBy",
    "dispatchedBy",
    "receivedBy",
    "notes",
    "lines",
    "status",
    "createdBy",
  ],
  salesInvoices: [
    "id",
    "no",
    "customerId",
    "date",
    "dueDate",
    "locationId",
    "paymentTerms",
    "salesperson",
    "notes",
    "lines",
    "status",
    "createdBy",
  ],
  salesReturns: [
    "id",
    "no",
    "customerId",
    "invoiceId",
    "date",
    "locationId",
    "reason",
    "notes",
    "lines",
    "status",
    "createdBy",
  ],
  wastages: [
    "id",
    "no",
    "date",
    "itemId",
    "itemType",
    "qty",
    "unit",
    "locationId",
    "wastageType",
    "reason",
    "approvedBy",
    "status",
    "createdBy",
  ],
  stockAdjustments: [
    "id",
    "no",
    "date",
    "locationId",
    "itemId",
    "itemType",
    "qty",
    "reason",
    "status",
    "createdBy",
  ],
  openingStocks: [
    "id",
    "no",
    "date",
    "locationId",
    "itemId",
    "itemType",
    "qty",
    "unitCost",
    "notes",
    "status",
    "createdBy",
  ],
  supplierPayments: [
    "id",
    "no",
    "supplierId",
    "date",
    "amount",
    "method",
    "reference",
    "notes",
    "status",
    "createdBy",
  ],
  customerPayments: [
    "id",
    "no",
    "customerId",
    "date",
    "amount",
    "method",
    "reference",
    "notes",
    "status",
    "createdBy",
  ],
  users: ["id", "name", "email", "role", "active", "modules", "username"],
  audit: [
    "id",
    "ts",
    "user",
    "action",
    "module",
    "recordType",
    "recordNo",
    "prevStatus",
    "newStatus",
    "description",
  ],
};

type Collection = Exclude<keyof Database, "counters">;

function fieldsFor<T>(collection: Collection | undefined, rows: T[], columns: Column<T>[]) {
  if (collection && FALLBACK_FIELDS[collection]) return FALLBACK_FIELDS[collection]!;
  const sample = rows[0] as Record<string, unknown> | undefined;
  if (sample)
    return Object.keys(sample).filter(
      (key) => !["display", "total", "paid", "outstanding"].includes(key),
    );
  return columns.filter((column) => column.key !== "__actions").map((column) => column.key);
}

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function dummyValue(collection: Collection | undefined, field: string, index: number) {
  const n = index + 1;
  const padded = String(n).padStart(3, "0");
  const key = field.toLowerCase();
  if (field === "id") return `EXAMPLE-${padded}`;
  if (key === "active") return true;
  if (key === "lines")
    return JSON.stringify([{ itemId: `ITEM-${padded}`, qty: 10 + n, unit: "KG", rate: 12.5 + n }]);
  if (key === "materials")
    return JSON.stringify([{ itemId: `RM-${padded}`, actualQty: 5 + n, unitCost: 8.5 + n }]);
  if (key === "modules") return JSON.stringify(["dashboard", "inventory", "reports"]);
  if (key === "kind") return collection === "products" ? "FG" : n % 2 ? "RM" : "FG";
  if (key === "itemtype") return n % 2 ? "RM" : "FG";
  if (key === "type")
    return collection === "locations" ? (n % 2 ? "raw_warehouse" : "shop") : "Retail";
  if (key === "role") return n % 2 ? "Warehouse" : "Sales";
  if (key === "status") return collection === "recipes" ? "Active" : "Posted";
  if (key === "action") return "Create";
  if (key.includes("date") || key === "ts") return `2026-08-0${Math.min(n, 9)}`;
  if (key === "email") return `example${n}@bakeryflow.local`;
  if (key === "phone") return `+971 50 555 ${String(1000 + n)}`;
  if (key === "barcode") return `629000000${String(100 + n)}`;
  if (key === "code") return `${collection?.slice(0, 3).toUpperCase() || "ROW"}-${padded}`;
  if (key === "no" || key.endsWith("number")) return `DOC-${padded}`;
  if (key.endsWith("id")) return `${field.replace(/Id$/i, "").toUpperCase()}-${padded}`;
  if (key === "name")
    return `Sample ${collection?.replace(/([A-Z])/g, " $1").trim() || "Record"} ${n}`;
  if (key === "username") return `sample.user${n}`;
  if (key === "address") return `${100 + n} Example Street, Dubai`;
  if (["notes", "reason", "remarks", "description"].includes(key))
    return `Example ${field.toLowerCase()} ${n}`;
  if (key === "unit" || key.endsWith("unit")) return n % 2 ? "KG" : "PCS";
  if (key === "paymentterms") return "30 Days";
  if (key === "method") return n % 2 ? "Bank Transfer" : "Cash";
  if (key === "reference") return `REF-${padded}`;
  if (key === "wastagetype") return n % 2 ? "Damage" : "Expiry";
  if (/(qty|quantity|cost|price|rate|amount|total|stock|level|limit|factor|days|pct)$/i.test(field))
    return 10 * n;
  return `Sample ${field} ${n}`;
}

export async function downloadExcelTemplate<T>(
  name: string,
  collection: Collection | undefined,
  rows: T[],
  columns: Column<T>[],
) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "BakeryFlow ERP";
  const sheet = workbook.addWorksheet("Import Data", { views: [{ state: "frozen", ySplit: 1 }] });
  const fields = fieldsFor(collection, rows, columns);
  sheet.columns = fields.map((field) => ({
    header: field,
    key: field,
    width: Math.min(28, Math.max(14, field.length + 3)),
  }));
  const header = sheet.getRow(1);
  header.font = { bold: true, color: { argb: "FFFFFFFF" } };
  header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2563EB" } };
  header.alignment = { vertical: "middle" };
  header.height = 22;
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: fields.length } };
  const dummyRows = Array.from({ length: 3 }, (_, index) =>
    Object.fromEntries(fields.map((field) => [field, dummyValue(collection, field, index)])),
  );
  sheet.addRows(dummyRows);
  for (let rowNumber = 2; rowNumber <= 4; rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF7D6" } };
    row.font = { color: { argb: "FF475569" } };
  }
  const instructions = workbook.addWorksheet("Instructions");
  instructions.columns = [{ width: 28 }, { width: 90 }];
  instructions.addRows([
    ["BakeryFlow Excel Import", "Enter one record per row in the Import Data sheet."],
    [
      "Example rows",
      "The three yellow rows contain dummy data. Replace or delete them before uploading if you do not want to import the examples.",
    ],
    ["Missing text", "Blank or omitted text values are imported as a dash (-)."],
    [
      "Typed fields",
      "Missing numbers become 0, booleans become FALSE, and list/line fields become [].",
    ],
    ["IDs", "Leave id blank to let the ERP generate a unique ID."],
    [
      "Nested lines",
      'Enter arrays such as invoice lines as JSON, for example [{"itemId":"FG-1","qty":10}].',
    ],
    ["Do not rename headers", "Header names are system field names and must remain unchanged."],
  ]);
  instructions.getRow(1).font = { bold: true, size: 14, color: { argb: "FF1D4ED8" } };
  const buffer = await workbook.xlsx.writeBuffer();
  download(
    new Blob([buffer as BlobPart], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
    `${name}-template.xlsx`,
  );
}

function cellValue(cell: ExcelJS.Cell) {
  const value = cell.value;
  if (value === null || value === undefined) return undefined;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "object") {
    if ("result" in value && value.result !== undefined) return value.result;
    if ("text" in value) return value.text;
    if ("richText" in value) return value.richText.map((part) => part.text).join("");
  }
  return value;
}

function convert(value: unknown, sample: unknown, field: string) {
  const numericField =
    /(?:qty|quantity|cost|price|rate|amount|total|stock|level|limit|factor|days|pct)$/i.test(field);
  if (value === undefined || value === "") {
    if (field === "id") return `XLS-${crypto.randomUUID()}`;
    if (Array.isArray(sample) || ["lines", "materials", "modules"].includes(field)) return [];
    if (typeof sample === "number" || numericField) return 0;
    if (typeof sample === "boolean" || field === "active") return false;
    return "-";
  }
  if (Array.isArray(sample) || ["lines", "materials", "modules"].includes(field)) {
    if (Array.isArray(value)) return value;
    try {
      return JSON.parse(String(value));
    } catch {
      throw new Error(`Column "${field}" must contain valid JSON.`);
    }
  }
  if (typeof sample === "number" || numericField) {
    const number = Number(value);
    if (!Number.isFinite(number)) throw new Error(`Column "${field}" must contain a number.`);
    return number;
  }
  if (typeof sample === "boolean" || field === "active")
    return value === true || ["true", "yes", "1", "active"].includes(String(value).toLowerCase());
  return String(value).trim() || "-";
}

export async function readExcelRecords<T>(file: File, collection: Collection, existingRows: T[]) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await file.arrayBuffer());
  const sheet = workbook.getWorksheet("Import Data") ?? workbook.worksheets[0];
  if (!sheet) throw new Error("The workbook does not contain a worksheet.");
  const headers = (sheet.getRow(1).values as unknown[])
    .slice(1)
    .map((value) => String(value ?? "").trim());
  if (!headers.some(Boolean)) throw new Error("The first row must contain column headers.");
  const allowed = new Set(fieldsFor(collection, existingRows, []));
  const unknown = headers.filter((header) => header && !allowed.has(header));
  if (unknown.length)
    throw new Error(`Unknown column${unknown.length > 1 ? "s" : ""}: ${unknown.join(", ")}`);
  const sample = (existingRows[0] ?? {}) as Record<string, unknown>;
  const records: Record<string, unknown>[] = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const supplied = headers.map(
      (header, index) => [header, cellValue(row.getCell(index + 1))] as const,
    );
    if (!supplied.some(([, value]) => value !== undefined && value !== "")) return;
    const record: Record<string, unknown> = {};
    for (const field of allowed) {
      const incoming = supplied.find(([header]) => header === field)?.[1];
      record[field] = convert(incoming, sample[field], field);
    }
    records.push(record);
  });
  if (!records.length) throw new Error("No data rows were found in the workbook.");
  return records as T[];
}
