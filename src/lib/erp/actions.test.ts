import { describe, expect, it, vi } from "vitest";
import { apiJson } from "../api";
import {
  actionAvailable,
  availableDocumentActions,
  singleFlight,
  validatePositiveQuantity,
} from "./actions";

describe("authoritative action helpers", () => {
  it("validates positive quantities", () => {
    expect(() => validatePositiveQuantity(0)).toThrow("positive");
    expect(() => validatePositiveQuantity(-1)).toThrow("positive");
    expect(() => validatePositiveQuantity(1)).not.toThrow();
  });

  it("hides unavailable or unauthorized actions", () => {
    expect(actionAvailable("APPROVED", ["APPROVED"], true)).toBe(true);
    expect(actionAvailable("POSTED", ["APPROVED"], true)).toBe(false);
    expect(actionAvailable("APPROVED", ["APPROVED"], false)).toBe(false);
  });

  it("prevents double submission while an action is pending", async () => {
    const operation = vi.fn(async () => "done");
    const run = singleFlight(operation);
    const [first, second] = await Promise.all([run(), run()]);
    expect(first).toBe("done");
    expect(second).toBe("done");
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it("surfaces backend conflict details", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ detail: "Stock was used downstream." }), {
            status: 409,
            headers: { "Content-Type": "application/json" },
          }),
      ),
    );
    await expect(apiJson("/test/", { auth: false })).rejects.toMatchObject({
      message: "Stock was used downstream.",
      status: 409,
    });
    vi.unstubAllGlobals();
  });
  it.each([
    ["transfer", "Partially Received", "receive"],
    ["return", "Posted", "cancel"],
    ["wastage", "Approved", "post"],
    ["adjustment", "Submitted", "approve"],
    ["payment", "Posted", "cancel"],
  ])("exposes valid %s actions", (kind, status, expected) => {
    expect(availableDocumentActions(kind, status)).toContain(expected);
  });
  it("never exposes actions for completed or cancelled documents", () => {
    expect(availableDocumentActions("payment", "Cancelled")).toEqual([]);
    expect(availableDocumentActions("transfer", "Received")).toEqual([]);
  });
});
