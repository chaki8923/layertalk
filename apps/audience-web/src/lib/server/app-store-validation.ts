import {
  Environment,
  Type,
  type JWSTransactionDecodedPayload,
} from "@apple/app-store-server-library";

export type VerifiedEventPassTransaction = {
  transactionId: string;
  originalTransactionId: string;
  appAccountToken: string;
  productId: string;
  bundleId: string;
  environment: "Sandbox" | "Production";
  purchaseAt: string;
  revocationAt: string | null;
};

function requiredString(value: string | undefined, field: string): string {
  if (!value) throw new Error(`Apple transaction is missing ${field}`);
  return value;
}

export function validateEventPassTransaction(
  transaction: JWSTransactionDecodedPayload,
  expectedProductId: string,
  expectedBundleId: string,
): VerifiedEventPassTransaction {
  const transactionId = requiredString(transaction.transactionId, "transactionId");
  const productId = requiredString(transaction.productId, "productId");
  const bundleId = requiredString(transaction.bundleId, "bundleId");
  const appAccountToken = requiredString(transaction.appAccountToken, "appAccountToken");
  const environment = transaction.environment;
  if (productId !== expectedProductId) throw new Error("Unexpected App Store product");
  if (bundleId !== expectedBundleId) throw new Error("Unexpected App Store bundle");
  // App Store Connect 上の Event Pass は Non-Renewing Subscription（7日間の期間限定アクセス）。
  if (transaction.type !== Type.NON_RENEWING_SUBSCRIPTION) throw new Error("Event Pass must be a non-renewing subscription");
  if (transaction.quantity !== undefined && transaction.quantity !== 1) throw new Error("Unexpected purchase quantity");
  if (environment !== Environment.SANDBOX && environment !== Environment.PRODUCTION) {
    throw new Error("Unsupported App Store environment");
  }
  if (!transaction.purchaseDate) throw new Error("Apple transaction is missing purchaseDate");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(appAccountToken)) {
    throw new Error("Invalid App Store appAccountToken");
  }
  return {
    transactionId,
    originalTransactionId: transaction.originalTransactionId ?? transactionId,
    appAccountToken,
    productId,
    bundleId,
    environment,
    purchaseAt: new Date(transaction.purchaseDate).toISOString(),
    revocationAt: transaction.revocationDate ? new Date(transaction.revocationDate).toISOString() : null,
  };
}
