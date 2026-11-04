import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { buildSeed } from "./seed";
import { buildLedger } from "./ledger";
import type { AppUser, Database, LedgerEntry } from "./types";
import { canManage, canView, modulesForRole, type ModuleKey } from "./permissions";
import { verifyPassword } from "./auth";
import { toast } from "sonner";
import { clearApiTokens, DEMO_LOGIN_ENABLED, getApiTokens } from "@/lib/api";
import { backendLogin, fetchBackendDatabase, fetchCurrentBackendUser } from "./backend";

const DB_KEY = "bakeryflow.db.v4";
const LEGACY_USER_KEY = "bakeryflow.user.v3";
const SESSION_KEY = "bakeryflow.session.v1";

interface Ctx {
  db: Database;
  ledger: LedgerEntry[];
  ready: boolean;
  user: AppUser | null;
  login: (username: string, password: string) => Promise<{ ok: boolean; message?: string }>;
  logout: () => void;
  branch: string;
  setBranch: (b: string) => void;
  update: (fn: (draft: Database) => void, audit?: AuditInput) => boolean;
  refreshFromBackend: () => Promise<boolean>;
  nextNo: (prefix: string, pad?: number) => string;
  can: (m: ModuleKey) => boolean;
  canView: (m: ModuleKey) => boolean;
  canManage: (m: ModuleKey) => boolean;
  reset: () => void;
}

export interface AuditInput {
  action: string;
  module: string;
  recordType: string;
  recordNo: string;
  prevStatus?: string;
  newStatus?: string;
  description: string;
}

const ErpContext = createContext<Ctx | null>(null);

async function loadBackendState(apiUser: AppUser) {
  return normalizeDatabase(await fetchBackendDatabase(apiUser));
}

export function normalizeDatabase(database: Database): Database {
  const used = new Set<string>();
  const usernameFor = (user: AppUser) => {
    const base =
      (user.username || user.email.split("@")[0] || user.name)
        .toLowerCase()
        .replace(/[^a-z0-9._-]/g, "")
        .slice(0, 30) || "user";
    let candidate = base;
    let suffix = 2;
    while (used.has(candidate)) candidate = `${base}${suffix++}`;
    used.add(candidate);
    return candidate;
  };
  let users: AppUser[] = database.users.map((user) => ({
    ...user,
    username: usernameFor(user),
    credentialState:
      user.passwordHash && user.passwordSalt ? ("ready" as const) : ("password-required" as const),
    modules: user.modules?.length ? user.modules : modulesForRole(user.role),
  }));
  const administrator = users.find((user) => user.role === "Administrator");
  if (administrator) {
    administrator.username = "admin";
    administrator.active = true;
    administrator.modules = modulesForRole("Administrator");
    if (!administrator.passwordHash) administrator.credentialState = "initial-admin";
  } else {
    users = [
      {
        id: "USR-ADMIN",
        name: "System Administrator",
        email: "admin@bakeryflow.local",
        role: "Administrator",
        active: true,
        modules: modulesForRole("Administrator"),
        username: "admin",
        credentialState: "initial-admin",
      },
      ...users,
    ];
  }
  return {
    ...database,
    openingStocks: database.openingStocks ?? [],
    users,
  };
}

function load(): Database {
  try {
    const raw = localStorage.getItem(DB_KEY);
    if (raw) {
      const normalized = normalizeDatabase(JSON.parse(raw) as Database);
      localStorage.setItem(DB_KEY, JSON.stringify(normalized));
      return normalized;
    }
  } catch {
    /* ignore */
  }
  const seed = normalizeDatabase(buildSeed());
  localStorage.setItem(DB_KEY, JSON.stringify(seed));
  return seed;
}

export function ErpProvider({ children }: { children: ReactNode }) {
  const [db, setDb] = useState<Database | null>(null);
  const [userId, setUserId] = useState<string>("");
  const [branch, setBranchState] = useState<string>("ALL");

  useEffect(() => {
    let cancelled = false;

    async function boot() {
      const loaded = load();
      localStorage.removeItem(LEGACY_USER_KEY);

      try {
        if (getApiTokens().access) {
          const apiUser = await fetchCurrentBackendUser();
          const apiDb = await loadBackendState(apiUser);
          if (cancelled) return;
          localStorage.setItem(DB_KEY, JSON.stringify(apiDb));
          localStorage.setItem(SESSION_KEY, JSON.stringify({ userId: apiUser.id, mode: "api" }));
          setDb(apiDb);
          setUserId(apiUser.id);
          return;
        }
      } catch {
        clearApiTokens();
      }

      if (cancelled) return;
      setDb(loaded);
      if (!DEMO_LOGIN_ENABLED) {
        localStorage.removeItem(SESSION_KEY);
        setUserId("");
        return;
      }
      try {
        const session = JSON.parse(localStorage.getItem(SESSION_KEY) ?? "null") as {
          userId?: string;
        } | null;
        const active = loaded.users.find(
          (candidate) => candidate.id === session?.userId && candidate.active,
        );
        if (active) setUserId(active.id);
        else localStorage.removeItem(SESSION_KEY);
      } catch {
        localStorage.removeItem(SESSION_KEY);
      }
    }

    void boot();
    return () => {
      cancelled = true;
    };
  }, []);

  const ledger = useMemo(() => (db ? buildLedger(db) : []), [db]);

  const update = useCallback(
    (fn: (draft: Database) => void, audit?: AuditInput) => {
      if (!db || !userId) return false;
      const draft: Database = structuredClone(db);
      fn(draft);
      if (audit) {
        draft.audit.unshift({
          id: "A-" + Date.now() + "-" + Math.floor(Math.random() * 1000),
          ts: new Date().toISOString(),
          user: draft.users.find((u) => u.id === userId)?.name ?? "System",
          ...audit,
        });
      }
      // Persist before publishing state so callers can safely close dialogs,
      // log out, or navigate as soon as update() returns.
      localStorage.setItem(DB_KEY, JSON.stringify(draft));
      setDb(draft);
      return true;
    },
    [db, userId],
  );

  const nextNo = useCallback(
    (prefix: string, padLen = 4) => {
      const n = (db?.counters[prefix] ?? 0) + 1;
      return `${prefix}-24${String(n).padStart(padLen, "0")}`;
    },
    [db],
  );

  const refreshFromBackend = useCallback(async () => {
    if (!getApiTokens().access) return false;
    const apiUser = await fetchCurrentBackendUser();
    const remoteDb = normalizeDatabase(await fetchBackendDatabase(apiUser));
    const apiDb = remoteDb;
    localStorage.setItem(DB_KEY, JSON.stringify(apiDb));
    localStorage.setItem(SESSION_KEY, JSON.stringify({ userId: apiUser.id, mode: "api" }));
    setDb(apiDb);
    setUserId(apiUser.id);
    return true;
  }, []);

  const login = useCallback(
    async (username: string, password: string) => {
      if (!db) return { ok: false, message: "BakeHub is still loading." };
      try {
        const apiUser = await backendLogin(username.trim(), password);
        const apiDb = await loadBackendState(apiUser);
        localStorage.setItem(DB_KEY, JSON.stringify(apiDb));
        localStorage.setItem(SESSION_KEY, JSON.stringify({ userId: apiUser.id, mode: "api" }));
        setDb(apiDb);
        setUserId(apiUser.id);
        return { ok: true };
      } catch (error) {
        if (!DEMO_LOGIN_ENABLED) {
          return {
            ok: false,
            message:
              error instanceof Error
                ? error.message
                : "Backend login failed. Check API URL and CORS settings.",
          };
        }
      }

      const normalized = username.trim().toLowerCase();
      const matchedAccount = db.users.find(
        (candidate) => candidate.username?.toLowerCase() === normalized,
      );
      const account = matchedAccount;
      if (!account) return { ok: false, message: "Incorrect username or password." };
      if (!account.active)
        return { ok: false, message: "This account is inactive. Contact an administrator." };
      if (!matchedAccount || account.role === "Administrator") {
        if (!password) return { ok: false, message: "Enter any non-empty password." };
      } else {
        if (!account.passwordHash || !account.passwordSalt)
          return {
            ok: false,
            message: "No password is set for this account. Ask an administrator to reset it.",
          };
        if (!(await verifyPassword(password, account.passwordSalt, account.passwordHash)))
          return { ok: false, message: "Incorrect username or password." };
      }
      setUserId(account.id);
      localStorage.setItem(SESSION_KEY, JSON.stringify({ userId: account.id }));
      return { ok: true };
    },
    [db],
  );

  const logout = useCallback(() => {
    setUserId("");
    localStorage.removeItem(SESSION_KEY);
    clearApiTokens();
  }, []);

  const setBranch = useCallback((b: string) => setBranchState(b), []);

  const reset = useCallback(() => {
    localStorage.removeItem(DB_KEY);
    const seed = normalizeDatabase(buildSeed());
    setDb(seed);
    setUserId("");
    localStorage.removeItem(SESSION_KEY);
    clearApiTokens();
    localStorage.setItem(DB_KEY, JSON.stringify(seed));
  }, []);

  const value = useMemo<Ctx | null>(() => {
    if (!db) return null;
    const user = db.users.find((u) => u.id === userId && u.active) ?? null;
    return {
      ready: true,
      db,
      ledger,
      user,
      login,
      logout,
      branch,
      setBranch,
      update,
      refreshFromBackend,
      nextNo,
      can: (m: ModuleKey) =>
        !!user && canManage(user.role, m) && (user.role === "Administrator" || (user.modules ?? []).includes(m)),
      canView: (m: ModuleKey) =>
        !!user && canView(user.role, m) && (user.role === "Administrator" || (user.modules ?? []).includes(m)),
      canManage: (m: ModuleKey) =>
        !!user && canManage(user.role, m) && (user.role === "Administrator" || (user.modules ?? []).includes(m)),
      reset,
    };
  }, [
    db,
    ledger,
    userId,
    branch,
    login,
    logout,
    setBranch,
    update,
    refreshFromBackend,
    nextNo,
    reset,
  ]);

  if (!value) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          Loading BakeHub…
        </div>
      </div>
    );
  }

  return <ErpContext.Provider value={value}>{children}</ErpContext.Provider>;
}

export function useErp() {
  const ctx = useContext(ErpContext);
  if (!ctx) throw new Error("useErp must be used inside ErpProvider");
  return ctx;
}

/** Convenience lookups */
export function useLookups() {
  const { db } = useErp();
  return useMemo(() => {
    const loc = Object.fromEntries(db.locations.map((l) => [l.id, l]));
    const sup = Object.fromEntries(db.suppliers.map((l) => [l.id, l]));
    const cus = Object.fromEntries(db.customers.map((l) => [l.id, l]));
    const rm = Object.fromEntries(db.rawMaterials.map((l) => [l.id, l]));
    const fg = Object.fromEntries(db.products.map((l) => [l.id, l]));
    const cat = Object.fromEntries(db.categories.map((l) => [l.id, l]));
    const item = { ...rm, ...fg } as Record<string, { code: string; name: string }>;
    return { loc, sup, cus, rm, fg, cat, item };
  }, [db]);
}
