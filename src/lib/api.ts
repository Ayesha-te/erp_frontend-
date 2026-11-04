export const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL || "https://erp2.stride-events.net/api"
).replace(/\/+$/, "");
export const DEMO_LOGIN_ENABLED = import.meta.env.VITE_ENABLE_DEMO_LOGIN === "true";

const ACCESS_TOKEN_KEY = "bakeryflow.api.access";
const REFRESH_TOKEN_KEY = "bakeryflow.api.refresh";

export const API_ENDPOINTS = {
  health: "/health/",
  auth: {
    login: "/auth/login/",
    refresh: "/auth/refresh/",
    logout: "/auth/logout/",
    me: "/auth/me/",
    changePassword: "/auth/change-password/",
    users: "/auth/users/",
  },
  locations: "/locations/",
  suppliers: "/suppliers/",
  customers: "/customers/",
  categories: "/categories/",
  units: "/units/",
  taxRates: "/tax-rates/",
  paymentMethods: "/payment-methods/",
  rawMaterials: "/raw-materials/",
  finishedProducts: "/finished-products/",
  shopProductSettings: "/shop-product-settings/",
  stockTransactions: "/inventory/stock-transactions/",
  stockBalances: "/inventory/stock-transactions/balances/",
  stockAdjustment: "/inventory/adjustments/",
  wastage: "/inventory/wastage/",
  customerPayments: "/customer-payments/",
  supplierPayments: "/supplier-payments/",
  openingFinishedGoods: "/inventory/stock-transactions/opening-finished-goods/",
  clearFinishedGoods: "/inventory/stock-transactions/clear-finished-goods/",
  openingRawMaterial: "/inventory/stock-transactions/opening-raw-material/",
  purchases: "/purchases/",
  scanReceipt: "/purchases/scan-receipt/",
  reorderAlerts: "/reorder-alerts/",
  recipes: "/recipes/",
  productionBatches: "/production-batches/",
  materialTransfers: "/material-transfers/",
  finishedGoodsTransfers: "/finished-goods-transfers/",
  salesInvoices: "/sales-invoices/",
  salesReturns: "/sales-returns/",
  auditLogs: "/audit-logs/",
  reports: {
    stockLedger: "/reports/stock-ledger/",
    salesByProduct: "/reports/sales-by-product/",
    dailySales: "/reports/daily-sales/",
  },
  dashboard: "/dashboard/",
  reportExports: "/report-exports/",
  clearBusinessData: "/system/clear-business-data/",
} as const;

export interface ApiTokens {
  access: string;
  refresh: string;
}

interface ApiResponseData {
  detail?: string;
  message?: string;
  non_field_errors?: string[];
  errors?: unknown;
  [key: string]: unknown;
}

export function getApiTokens(): Partial<ApiTokens> {
  if (typeof window === "undefined") return {};
  return {
    access: localStorage.getItem(ACCESS_TOKEN_KEY) || undefined,
    refresh: localStorage.getItem(REFRESH_TOKEN_KEY) || undefined,
  };
}

export function setApiTokens(tokens: ApiTokens) {
  if (typeof window === "undefined") return;
  localStorage.setItem(ACCESS_TOKEN_KEY, tokens.access);
  localStorage.setItem(REFRESH_TOKEN_KEY, tokens.refresh);
}

export function clearApiTokens() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
}

const BAKERY_CODE_KEY = "bakehub.bakery";
const BAKERY_NAME_KEY = "bakehub.bakeryName";

export function getBakeryCode() {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(BAKERY_CODE_KEY) || "";
}
export function getBakeryName() {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(BAKERY_NAME_KEY) || "";
}
export function setBakery(code: string, name?: string) {
  if (typeof window === "undefined") return;
  localStorage.setItem(BAKERY_CODE_KEY, code.trim().toLowerCase());
  if (name !== undefined) localStorage.setItem(BAKERY_NAME_KEY, name);
}
export function clearBakeryName() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(BAKERY_NAME_KEY);
}

export function apiUrl(path = "") {
  const normalizedPath = path.startsWith("/") ? path.slice(1) : path;
  return normalizedPath ? `${API_BASE_URL}/${normalizedPath}` : API_BASE_URL;
}

let tokenRefresh: Promise<string> | null = null;

export type ApiRequestInit = RequestInit & {
  auth?: boolean;
  idempotent?: boolean;
};

async function refreshAccessToken() {
  if (tokenRefresh) return tokenRefresh;
  tokenRefresh = (async () => {
    const refresh = getApiTokens().refresh;
    if (!refresh) throw new Error("Your session has expired. Please sign in again.");
    const response = await fetch(apiUrl(API_ENDPOINTS.auth.refresh), {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Bakery": getBakeryCode() },
      body: JSON.stringify({ refresh }),
    });
    if (!response.ok) {
      clearApiTokens();
      throw new Error("Your session has expired. Please sign in again.");
    }
    const data = (await response.json()) as { access: string; refresh?: string };
    setApiTokens({ access: data.access, refresh: data.refresh || refresh });
    return data.access;
  })().finally(() => {
    tokenRefresh = null;
  });
  return tokenRefresh;
}

export async function apiFetch(path: string, init?: ApiRequestInit) {
  const headers = new Headers(init?.headers);
  const useAuth = init?.auth !== false;
  const { auth: _auth, idempotent = false, ...requestInit } = init ?? {};

  if (init?.body && !(init.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  if (idempotent && !headers.has("Idempotency-Key")) {
    headers.set("Idempotency-Key", crypto.randomUUID());
  }

  if (!headers.has("X-Bakery")) {
    const code = getBakeryCode();
    if (code) headers.set("X-Bakery", code);
  }

  if (useAuth && !headers.has("Authorization")) {
    const token = getApiTokens().access;
    if (token) headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(apiUrl(path), {
    ...requestInit,
    headers,
  });
  if (response.status !== 401 || !useAuth) return response;

  const access = await refreshAccessToken();
  const retryHeaders = new Headers(headers);
  retryHeaders.set("Authorization", `Bearer ${access}`);
  return fetch(apiUrl(path), { ...requestInit, headers: retryHeaders });
}

export async function apiJson<T>(path: string, init?: ApiRequestInit): Promise<T> {
  const response = await apiFetch(path, init);
  const text = await response.text();
  let data: ApiResponseData | null = null;
  if (text) {
    try {
      data = JSON.parse(text) as ApiResponseData;
    } catch {
      const contentType = response.headers.get("content-type") || "";
      const isHtml = contentType.includes("text/html") || /^\s*<!doctype|^\s*<html/i.test(text);
      throw new Error(
        isHtml
          ? `The server returned an invalid page (${response.status}). Please try again or contact support.`
          : `The server returned an invalid response (${response.status}).`,
      );
    }
  }

  if (!response.ok) {
    const firstValidationError = (value: unknown): string | undefined => {
      if (typeof value === "string") return value;
      if (Array.isArray(value)) {
        for (const item of value) {
          const message = firstValidationError(item);
          if (message) return message;
        }
      }
      if (value && typeof value === "object") {
        for (const item of Object.values(value as Record<string, unknown>)) {
          const message = firstValidationError(item);
          if (message) return message;
        }
      }
      return undefined;
    };
    const detail =
      data?.detail ||
      (data?.message && data.message !== "Request failed." ? data.message : undefined) ||
      data?.non_field_errors?.join?.(" ") ||
      firstValidationError(data?.errors) ||
      `Request failed with status ${response.status}`;
    throw Object.assign(new Error(detail), { status: response.status });
  }

  return data as T;
}

export async function apiList<T>(path: string): Promise<T[]> {
  const items: T[] = [];
  let next: string | null = path;

  while (next) {
    const page: T[] | { results: T[]; next?: string | null } = await apiJson(next);
    if (Array.isArray(page)) return [...items, ...page];
    items.push(...page.results);
    next = page.next ? page.next.replace(API_BASE_URL, "") : null;
  }

  return items;
}
