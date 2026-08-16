import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requirePresenter: vi.fn(),
  retrievePaymentIntent: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/server/supabase-admin", () => ({ requirePresenter: mocks.requirePresenter }));
vi.mock("@/lib/server/stripe", () => ({
  getStripe: () => ({ paymentIntents: { retrieve: mocks.retrievePaymentIntent } }),
}));

import { POST } from "./route";

function request(body: unknown) {
  return new Request("http://localhost/api/billing/receipt", {
    method: "POST",
    headers: { authorization: "Bearer token", "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function presenterWith(entitlement: unknown) {
  const maybeSingle = vi.fn().mockResolvedValue({ data: entitlement });
  const eq = vi.fn(() => ({ maybeSingle }));
  const select = vi.fn(() => ({ eq }));
  mocks.requirePresenter.mockResolvedValue({
    user: { id: "owner-1" },
    admin: { from: vi.fn(() => ({ select })) },
  });
}

describe("POST /api/billing/receipt", () => {
  beforeEach(() => {
    mocks.requirePresenter.mockReset();
    mocks.retrievePaymentIntent.mockReset();
  });

  it("rejects a missing entitlement id", async () => {
    presenterWith(null);
    const response = await POST(request({}));
    expect(response.status).toBe(400);
  });

  it("does not reveal another presenter's receipt", async () => {
    presenterWith({ owner_id: "owner-2", source: "stripe", stripe_payment_intent_id: "pi_other" });
    const response = await POST(request({ entitlementId: "entitlement-1" }));
    expect(response.status).toBe(404);
    expect(mocks.retrievePaymentIntent).not.toHaveBeenCalled();
  });

  it("returns only the Stripe receipt URL for an owned purchase", async () => {
    presenterWith({ owner_id: "owner-1", source: "stripe", stripe_payment_intent_id: "pi_owned" });
    mocks.retrievePaymentIntent.mockResolvedValue({ latest_charge: { receipt_url: "https://pay.stripe.com/receipts/example" } });
    const response = await POST(request({ entitlementId: "entitlement-1" }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ url: "https://pay.stripe.com/receipts/example" });
  });
});
