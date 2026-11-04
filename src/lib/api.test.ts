import { afterEach, describe, expect, it, vi } from "vitest";
import { API_ENDPOINTS, apiFetch } from "./api";

function response(status = 200) {
  return new Response(null, { status });
}

describe("API idempotency headers", () => {
  afterEach(() => vi.unstubAllGlobals());

  it.each([
    ["login", API_ENDPOINTS.auth.login, { method: "POST", auth: false }],
    ["logout", API_ENDPOINTS.auth.logout, { method: "POST" }],
    ["GET", API_ENDPOINTS.auth.me, undefined],
    ["ordinary mutation", API_ENDPOINTS.customers, { method: "POST" }],
  ])("does not add Idempotency-Key to %s", async (_name, path, init) => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => response());
    vi.stubGlobal("fetch", fetchMock);

    await apiFetch(path, init);

    const headers = new Headers(fetchMock.mock.calls[0][1]?.headers);
    expect(headers.has("Idempotency-Key")).toBe(false);
  });

  it("adds Idempotency-Key only when an authoritative action opts in", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => response());
    vi.stubGlobal("fetch", fetchMock);

    await apiFetch(`${API_ENDPOINTS.purchases}invoice-id/post/`, {
      method: "POST",
      idempotent: true,
    });

    const headers = new Headers(fetchMock.mock.calls[0][1]?.headers);
    expect(headers.get("Idempotency-Key")).toBeTruthy();
  });

  it("does not add Idempotency-Key to token refresh", async () => {
    const tokens = new Map([
      ["bakeryflow.api.access", "expired-access"],
      ["bakeryflow.api.refresh", "refresh-token"],
    ]);
    vi.stubGlobal("window", {});
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => tokens.get(key) ?? null,
      setItem: (key: string, value: string) => tokens.set(key, value),
      removeItem: (key: string) => tokens.delete(key),
    });
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => {
      if (fetchMock.mock.calls.length === 1) return response(401);
      if (fetchMock.mock.calls.length === 2) {
        return new Response(JSON.stringify({ access: "new-access" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return response();
    });
    vi.stubGlobal("fetch", fetchMock);

    await apiFetch(API_ENDPOINTS.auth.me);

    expect(String(fetchMock.mock.calls[1][0])).toContain(API_ENDPOINTS.auth.refresh);
    const refreshHeaders = new Headers(fetchMock.mock.calls[1][1]?.headers);
    expect(refreshHeaders.has("Idempotency-Key")).toBe(false);
  });
});
