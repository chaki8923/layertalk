import { Type, Environment, type JWSTransactionDecodedPayload } from "@apple/app-store-server-library";
import { describe, expect, it } from "vitest";

import { validateEventPassTransaction } from "./app-store-validation";

function transaction(
  patch: Partial<JWSTransactionDecodedPayload> = {},
): JWSTransactionDecodedPayload {
  return {
    transactionId: "2000000000000000",
    originalTransactionId: "2000000000000000",
    appAccountToken: "9a0ce8a1-e299-4d57-a530-1c4ab0509223",
    productId: "app.layertalk.presenter.event_pass",
    bundleId: "app.layertalk.presenter",
    type: Type.CONSUMABLE,
    quantity: 1,
    environment: Environment.SANDBOX,
    purchaseDate: Date.UTC(2026, 8, 5),
    ...patch,
  };
}

describe("validateEventPassTransaction", () => {
  it("accepts a bound consumable transaction", () => {
    const value = validateEventPassTransaction(
      transaction(),
      "app.layertalk.presenter.event_pass",
      "app.layertalk.presenter",
    );
    expect(value.transactionId).toBe("2000000000000000");
    expect(value.environment).toBe("Sandbox");
    expect(value.purchaseAt).toBe("2026-09-05T00:00:00.000Z");
  });

  it.each([
    [{ productId: "wrong.product" }, "Unexpected App Store product"],
    [{ bundleId: "wrong.bundle" }, "Unexpected App Store bundle"],
    [{ type: Type.NON_CONSUMABLE }, "Event Pass must be a consumable purchase"],
    [{ quantity: 2 }, "Unexpected purchase quantity"],
    [{ appAccountToken: "not-a-uuid" }, "Invalid App Store appAccountToken"],
  ] as const)("rejects an invalid purchase binding", (patch, message) => {
    expect(() => validateEventPassTransaction(
      transaction(patch),
      "app.layertalk.presenter.event_pass",
      "app.layertalk.presenter",
    )).toThrow(message);
  });
});
