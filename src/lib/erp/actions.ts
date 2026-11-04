export function actionAvailable(status: string, allowed: readonly string[], permitted: boolean) {
  return permitted && allowed.includes(status.toUpperCase());
}

export function validatePositiveQuantity(quantity: number) {
  if (!Number.isFinite(quantity) || quantity <= 0) throw new Error("Quantity must be positive.");
}

export function singleFlight<TArgs extends unknown[], TResult>(
  operation: (...args: TArgs) => Promise<TResult>,
) {
  let pending: Promise<TResult> | null = null;
  return (...args: TArgs) => {
    if (pending) return pending;
    pending = operation(...args).finally(() => {
      pending = null;
    });
    return pending;
  };
}

export function availableDocumentActions(kind: string, status: string) {
  const value = status.toUpperCase().replaceAll(" ", "_");
  const flows: Record<string, Record<string, string[]>> = {
    transfer: {
      DRAFT: ["submit", "cancel"],
      SUBMITTED: ["approve", "dispatch", "cancel"],
      APPROVED: ["dispatch", "cancel"],
      DISPATCHED: ["receive", "cancel"],
      IN_TRANSIT: ["receive", "cancel"],
      PARTIALLY_RECEIVED: ["receive", "cancel"],
    },
    return: {
      DRAFT: ["submit", "post"],
      SUBMITTED: ["post"],
      APPROVED: ["post"],
      POSTED: ["cancel"],
    },
    wastage: {
      DRAFT: ["submit", "cancel"],
      SUBMITTED: ["approve", "cancel"],
      APPROVED: ["post", "cancel"],
      POSTED: ["cancel"],
    },
    adjustment: {
      DRAFT: ["submit", "cancel"],
      SUBMITTED: ["approve", "cancel"],
      APPROVED: ["post", "cancel"],
      POSTED: ["cancel"],
    },
    payment: { DRAFT: ["post"], POSTED: ["cancel"] },
  };
  return flows[kind]?.[value] ?? [];
}
