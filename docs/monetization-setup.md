# Monetization setup

LayerTalk currently sells the one-time **Event Pass** for JPY 2,980. Checkout,
fulfillment, refunds, signed offline leases, and retention run in the Audience
Next.js app; the Presenter app never receives a Stripe or Supabase secret key.

## Runtime requirements

- Node.js 22 or newer
- The Supabase project referenced by `VITE_SUPABASE_URL` and
  `NEXT_PUBLIC_SUPABASE_URL`
- A deployed Audience app with HTTPS

The migrations in `supabase/migrations` are the source of truth. The
monetization migrations have been applied to the `layertalk` Supabase project
(`xnqduwlagmfaxzsaaicj`).

## Supabase

In Authentication settings:

1. Enable email OTP for presenters.
2. Configure custom SMTP before production. The default mailer is intended for
   development and has strict rate limits.
3. Enable anonymous sign-ins for audience members. This is applied and verified
   by `npm run configure:supabase-auth` below.
4. Configure Cloudflare Turnstile as Auth CAPTCHA and set the matching site key
   in `NEXT_PUBLIC_TURNSTILE_SITE_KEY`.
5. Keep leaked-password protection enabled for any password-based sign-in added
   later.

### Presenter email OTP templates

The Presenter app expects a six-digit code and does not handle an external
Magic Link redirect. Both hosted Auth templates must therefore use `{{ .Token }}`:

- `supabase/templates/confirmation.html` for a presenter's first sign-in
- `supabase/templates/magic_link.html` for subsequent sign-ins

Apply anonymous audience sign-in together with the checked-in bilingual
templates, six-digit length, ten-minute expiry, and 60-second resend interval
through the Supabase Management API:

```sh
export SUPABASE_ACCESS_TOKEN=<personal-access-token>
npm run configure:supabase-auth
unset SUPABASE_ACCESS_TOKEN
```

Create the personal access token from the Supabase account page and set it only
in the local shell or a secret manager. Never add it to an `.env` file or commit
it. The script updates project `xnqduwlagmfaxzsaaicj`, reads the configuration
back, and fails unless anonymous sign-in, both templates, and all OTP settings
match.

The database does not expose rooms to unjoined anonymous users. Audience access
is granted for 12 hours by `join_room`, after CAPTCHA and optional room-passcode
verification. `billing_events` and `comment_likes` intentionally have RLS with
no direct policies; they are server/RPC-only tables.

## Stripe

Create a one-time Price with these exact properties:

- Product: `LayerTalk Event Pass`
- Currency: `JPY`
- Unit amount: `2980`
- Tax behavior: inclusive if the UI continues to label the price as tax included

Put its `price_...` ID in `STRIPE_EVENT_PASS_PRICE_ID`. Use a restricted key in
`STRIPE_RESTRICTED_KEY` with only the permissions needed to read/write Checkout
Sessions and Customers and to read Prices, PaymentIntents, and Charges. Do not place this key in a
`NEXT_PUBLIC_...` or `VITE_...` variable.

Keep the key and the price ID in the same mode. A test key with a live price ID
fails with `No such price`, which surfaces in the Presenter app only as
"could not prepare checkout".

### Account settings that break Checkout

Two Dashboard-side prerequisites are easy to miss because nothing in this
repository can enforce them, and both fail as an opaque 500 in the Presenter app.
Read the real reason from the `[billing/checkout]` line in the Vercel function log.

**Managed Payments must stay off.** Stripe's merchant-of-record solution is
enabled by default on some accounts, and it cannot be combined with the
`custom_text` this integration sends — Checkout Session creation fails with a 400.
Note that Stripe's own [unsupported-parameter list](https://docs.stripe.com/payments/managed-payments/update-checkout)
does not mention `custom_text`; the live API is stricter than the table. The route
therefore sends `managed_payments[enabled]=false` explicitly, so no Dashboard work
is required. Do not switch this to the Dashboard toggle: that setting is held
separately per mode, so turning it off in test mode would leave live mode broken.

Adopting Managed Payments would make Stripe the seller, which contradicts the
commerce disclosure, refund policy, terms consent, and receipt flow shipped here —
all of which name the presenter as the seller. That is a legal-content change,
not a configuration change.

**A Terms of Service URL is required in public details.** The session is created
with `consent_collection[terms_of_service] = required`, which only works when
Settings → Business → Public details carries a terms URL. Point it at
`<audience-host>/legal/terms`.

Keep `BILLING_PUBLICATION_ENABLED=false` until the legal and support details are
final. When it is `true`, the web prebuild check requires all of the following and
the Checkout API becomes available:

- `LEGAL_SELLER_NAME`
- `LEGAL_OPERATOR_NAME`
- `LEGAL_ADDRESS`
- `LEGAL_PHONE`
- `LEGAL_SUPPORT_EMAIL`
- `LEGAL_RESPONSE_TIME`
- `LEGAL_REFUND_POLICY`

`LEGAL_SYSTEM_REQUIREMENTS_URL` is optional. A build with publication enabled
fails if any required value is empty, so draft placeholders cannot accidentally
ship alongside an active purchase flow.

Create a webhook endpoint at:

```text
https://<audience-host>/api/billing/webhook
```

Subscribe it to:

- `checkout.session.completed`
- `checkout.session.async_payment_succeeded`
- `checkout.session.async_payment_failed`
- `checkout.session.expired`
- `charge.refunded`
- `charge.dispute.created`

Store the endpoint signing secret in `STRIPE_WEBHOOK_SECRET`. Webhook signature
verification uses the raw request body. Fulfillment is idempotent by Stripe
Event ID and Checkout Session ID. Full refunds and disputes revoke future use;
an already-running presentation keeps its entitlement snapshot until it ends.

## Offline entitlement keys

Generate a dedicated Ed25519 key pair outside the repository:

```sh
openssl genpkey -algorithm ED25519 -out event-pass-private.pem
openssl pkey -in event-pass-private.pem -pubout -out event-pass-public.pem
```

Set the private PKCS#8 PEM as `ENTITLEMENT_SIGNING_PRIVATE_KEY` on the Audience
server, and the public SPKI PEM as `VITE_ENTITLEMENT_PUBLIC_KEY` at Presenter
build time. Rotate both together and increment `ENTITLEMENT_SIGNING_KEY_ID`.
Never commit either generated file.

See the two checked-in examples for the complete variable list:

- `apps/audience-web/.env.example`
- `apps/presenter-app/.env.example`

## Retention job

Call the following endpoint once per day using the same long random value stored
as `CRON_SECRET`:

```text
POST https://<audience-host>/api/internal/retention
Authorization: Bearer <CRON_SECRET>
```

It removes free comment/reaction data after 7 days, paid event history after 30
days, old custom-stamp objects, and stale anonymous Auth users. Monitor the JSON
counts and alert on non-2xx responses.

## Release verification

Before each release:

```sh
npm ci
npm run typecheck
npm run lint
npm run build -w @layertalk/presenter-app
npm exec -w @layertalk/audience-web -- next build --webpack
```

Then complete one Stripe test-mode purchase, confirm an `entitlements` row was
created once, resend the webhook to confirm idempotency, and test a full refund.
Also verify an anonymous audience member cannot read a room before `join_room`,
and cannot read another room's comments, assets, or private broadcasts.
