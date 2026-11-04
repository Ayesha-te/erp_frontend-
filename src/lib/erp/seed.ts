import type { Database } from "./types";

export function buildSeed(): Database {
  const locations: Database["locations"] = [
    {
      id: "L-RMW",
      code: "RMW",
      name: "Raw Material Warehouse",
      type: "raw_warehouse",
      active: true,
    },
    { id: "L-PROD", code: "PRD", name: "Production Department", type: "production", active: true },
    {
      id: "L-FGW",
      code: "FGW",
      name: "Finished Goods Warehouse",
      type: "fg_warehouse",
      active: true,
    },
    { id: "L-BRANCH", code: "BRN", name: "Main Branch", type: "branch", active: true },
    { id: "L-SHOP", code: "SHP", name: "Retail Shop", type: "shop", active: true },
    { id: "L-TRANSIT", code: "TRN", name: "In Transit", type: "virtual", active: true },
    { id: "L-DAMAGED", code: "DMG", name: "Non-Saleable Store", type: "virtual", active: true },
  ];

  const categories: Database["categories"] = [
    { id: "C-RM", name: "Raw Materials", kind: "RM" },
    { id: "C-PKG", name: "Packaging", kind: "RM" },
    { id: "C-FG", name: "Finished Goods", kind: "FG" },
  ];

  const uoms: Database["uoms"] = [
    { id: "U-KG", code: "KG", name: "Kilogram" },
    { id: "U-G", code: "G", name: "Gram" },
    { id: "U-LTR", code: "LTR", name: "Litre" },
    { id: "U-PCS", code: "PCS", name: "Pieces" },
    { id: "U-PACK", code: "PACK", name: "Pack" },
  ];

  const taxRates: Database["taxRates"] = [
    { id: "T-0", name: "Zero Rated 0%", rate: 0 },
    { id: "T-5", name: "Standard VAT 5%", rate: 5 },
  ];

  const paymentMethods: Database["paymentMethods"] = [
    { id: "PM-CASH", name: "Cash" },
    { id: "PM-BANK", name: "Bank Transfer" },
    { id: "PM-CHQ", name: "Cheque" },
    { id: "PM-CARD", name: "Card" },
  ];

  const employees: Database["employees"] = [];
  const users: Database["users"] = [];

  return {
    locations,
    categories,
    uoms,
    taxRates,
    paymentMethods,
    employees,
    suppliers: [],
    customers: [],
    rawMaterials: [],
    products: [],
    purchaseInvoices: [],
    supplierPayments: [],
    materialTransfers: [],
    recipes: [],
    productionBatches: [],
    wastages: [],
    stockTransfers: [],
    salesInvoices: [],
    customerPayments: [],
    salesReturns: [],
    stockAdjustments: [],
    openingStocks: [],
    audit: [],
    users,
    counters: {
      PI: 0,
      MT: 0,
      PRD: 0,
      TR: 0,
      SI: 0,
      SR: 0,
      SPY: 0,
      CPY: 0,
      WST: 0,
      RCP: 0,
      ADJ: 0,
    },
  };
}
