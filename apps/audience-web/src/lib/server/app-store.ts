import "server-only";

import {
  Environment,
  NotificationTypeV2,
  SignedDataVerifier,
  type ResponseBodyV2DecodedPayload,
} from "@apple/app-store-server-library";

import { appleRootCertificates } from "./apple-root-certificates";
import { validateEventPassTransaction } from "./app-store-validation";
import { serverEnv } from "./env";
import { createAdminClient } from "./supabase-admin";

function requiredString(value: string | undefined, field: string): string {
  if (!value) throw new Error(`Apple transaction is missing ${field}`);
  return value;
}

type Verifier = Pick<SignedDataVerifier, "verifyAndDecodeTransaction" | "verifyAndDecodeNotification">;

export class AppleSignatureVerificationError extends Error {
  constructor(cause: unknown) {
    super("Apple signature verification failed", { cause });
    this.name = "AppleSignatureVerificationError";
  }
}

function verifiers(): Verifier[] {
  const roots = appleRootCertificates();
  const bundleId = serverEnv.appleBundleId();
  const appId = serverEnv.appleAppId();
  const result: Verifier[] = [];
  // Apple requires the numeric App Store app id for production verification.
  // Keep sandbox/Xcode testing usable before the listing has assigned one.
  if (appId !== undefined) {
    result.push(new SignedDataVerifier(roots, true, Environment.PRODUCTION, bundleId, appId));
  }
  result.push(new SignedDataVerifier(roots, true, Environment.SANDBOX, bundleId));
  return result;
}

async function verifyWithFallback<T>(operation: (verifier: Verifier) => Promise<T>): Promise<T> {
  let failure: unknown;
  for (const verifier of verifiers()) {
    try { return await operation(verifier); }
    catch (error) { failure = error; }
  }
  throw new AppleSignatureVerificationError(failure);
}

export async function verifyTransaction(signedTransaction: string) {
  const decoded = await verifyWithFallback((verifier) =>
    verifier.verifyAndDecodeTransaction(signedTransaction));
  return validateEventPassTransaction(
    decoded,
    serverEnv.appleEventPassProductId(),
    serverEnv.appleBundleId(),
  );
}

export async function verifyNotification(signedPayload: string): Promise<ResponseBodyV2DecodedPayload> {
  return verifyWithFallback((verifier) => verifier.verifyAndDecodeNotification(signedPayload));
}

export async function fulfillAppStoreTransaction(
  signedTransaction: string,
  expectedOwnerId?: string,
) {
  const transaction = await verifyTransaction(signedTransaction);
  const admin = createAdminClient();
  const { data: attempt, error: attemptError } = await admin
    .from("app_store_purchase_attempts")
    .select("id, owner_id, room_id, product_id")
    .eq("id", transaction.appAccountToken)
    .maybeSingle();
  if (attemptError) throw attemptError;
  if (!attempt) throw new Error("App Store purchase attempt not found");
  if (expectedOwnerId && attempt.owner_id !== expectedOwnerId) throw new Error("App Store purchase owner mismatch");
  if (attempt.product_id !== transaction.productId) throw new Error("App Store purchase product mismatch");
  if (transaction.revocationAt) throw new Error("App Store transaction has been revoked");

  const { data, error } = await admin.rpc("fulfill_app_store_event_pass", {
    p_attempt_id: attempt.id,
    p_owner_id: attempt.owner_id,
    p_transaction_id: transaction.transactionId,
    p_original_transaction_id: transaction.originalTransactionId,
    p_product_id: transaction.productId,
    p_bundle_id: transaction.bundleId,
    p_environment: transaction.environment,
    p_purchase_at: transaction.purchaseAt,
    p_signed_transaction: signedTransaction,
  });
  if (error) throw error;
  return { entitlement: data, transactionId: transaction.transactionId };
}

export async function processAppStoreNotification(signedPayload: string) {
  const notification = await verifyNotification(signedPayload);
  const notificationId = requiredString(notification.notificationUUID, "notificationUUID");
  const notificationType = requiredString(notification.notificationType, "notificationType");
  const signedTransaction = notification.data?.signedTransactionInfo;
  const admin = createAdminClient();
  let transactionId: string | null = null;
  let status: "processed" | "ignored" = "ignored";

  try {
    if (signedTransaction) {
      const transaction = await verifyTransaction(signedTransaction);
      transactionId = transaction.transactionId;
      if (notificationType === NotificationTypeV2.ONE_TIME_CHARGE) {
        await fulfillAppStoreTransaction(signedTransaction);
        status = "processed";
      } else if (notificationType === NotificationTypeV2.REFUND) {
        const { error } = await admin.rpc("refund_app_store_event_pass", {
          p_transaction_id: transaction.transactionId,
          p_refunded_at: transaction.revocationAt ?? new Date().toISOString(),
          p_reason: "app_store_refund",
        });
        if (error) throw error;
        status = "processed";
      } else if (notificationType === NotificationTypeV2.REFUND_REVERSED) {
        const { error } = await admin.rpc("reverse_app_store_refund", {
          p_transaction_id: transaction.transactionId,
        });
        if (error) throw error;
        status = "processed";
      }
      // CONSUMPTION_REQUEST is intentionally recorded but not answered. Apple
      // requires explicit customer consent before consumption data is submitted.
    }

    const { error } = await admin.rpc("record_app_store_event", {
      p_notification_uuid: notificationId,
      p_notification_type: notificationType,
      p_subtype: notification.subtype ?? null,
      p_transaction_id: transactionId,
      p_environment: notification.data?.environment ?? null,
      p_status: status,
      p_error_message: notificationType === NotificationTypeV2.CONSUMPTION_REQUEST
        ? "Consumption data withheld until explicit customer consent"
        : null,
    });
    if (error) throw error;
  } catch (error) {
    try {
      await admin.rpc("record_app_store_event", {
        p_notification_uuid: notificationId,
        p_notification_type: notificationType,
        p_subtype: notification.subtype ?? null,
        p_transaction_id: transactionId,
        p_environment: notification.data?.environment ?? null,
        p_status: "failed",
        p_error_message: error instanceof Error ? error.message.slice(0, 500) : "Unknown processing error",
      });
    } catch { /* The original processing error must determine the retry response. */ }
    throw error;
  }
  return { notificationId, status };
}
