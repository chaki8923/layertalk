import {
  AppleSignatureVerificationError,
  processAppStoreNotification,
} from "@/lib/server/app-store";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const input = await request.json() as { signedPayload?: string };
    if (!input.signedPayload || input.signedPayload.length > 256_000) {
      return new Response("Invalid notification", { status: 400 });
    }
    await processAppStoreNotification(input.signedPayload);
    return Response.json({ received: true });
  } catch (error) {
    if (error instanceof AppleSignatureVerificationError) {
      return new Response("Invalid notification signature", { status: 400 });
    }
    // A 5xx response asks App Store Server Notifications to retry delivery.
    console.error("[billing/app-store/notifications]", error);
    return new Response("Notification processing failed", { status: 500 });
  }
}
