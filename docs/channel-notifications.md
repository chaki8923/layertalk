# Presentation-start notifications

Each room can have one Slack and one Teams destination on each Mac. Settings are separated by the signed-in LayerTalk account and room. This is a free, optional feature; new rooms start with no destinations. Saving a URL alone leaves automatic sending off unless the checkbox is explicitly selected.

## Setup

In the presenter app, open **Room → Send the join URL on start → Configure destinations and message**. Enter a name that identifies the destination, paste its webhook URL, optionally enable automatic sending, and save. The name is only a local label: the actual channel and sender are configured in Slack or Teams. Use **Send test** to post a clearly labeled test with the current join URL.

- **Slack:** Create an app with Incoming Webhooks enabled, install it in the intended workspace, select the channel, and paste the generated `https://hooks.slack.com/services/...` URL. Posts use that Slack app's identity. Workspace policies may require admin approval. [Slack setup](https://docs.slack.dev/messaging/sending-messages-using-incoming-webhooks/).
- **Teams:** In the target channel, open Workflows and create a webhook workflow using **When a Teams webhook request is received**. Choose **Anyone** for the trigger's callers (the secret URL authorizes the request). Configure the flow to post the received Adaptive Card to the intended channel. Use the official webhook-to-channel workflow template or the Adaptive Card request schema linked below. The sender is the Workflow's configured bot/user. Copy its `*.logic.azure.com` or `*.environment.api.powerplatform.com` workflow invocation URL. Tenant-restricted bearer-token authentication, government clouds, legacy Office 365 Connector URLs, and arbitrary/custom webhook domains are not supported in v1. Organization policy may prevent this setup. [Teams trigger and card schema](https://learn.microsoft.com/en-us/connectors/teams/#microsoft-teams-webhook), [workflow setup](https://support.microsoft.com/en-us/workflows/send-messages-in-teams-using-incoming-webhooks).

Assign a Teams workflow co-owner where appropriate: a workflow belongs to its owner, not the channel, and may stop working when its owner's account is removed. A successful HTTP response only confirms acceptance by the workflow, not completion of the downstream channel post.

## Delivery behavior

The fixed invitation contains only a start announcement and the same public HTTPS URL used by the room's QR code. It does not include the room title, passcode, comments, slide images, or mentions. The app's selected language determines the text. Localhost/non-HTTPS audience URLs cannot be sent.

Starting a presentation snapshots the destinations in native memory. After native presentation startup succeeds, both enabled destinations are sent independently. No mount, reload, reconnection, or setting change triggers a post. Ending and starting again is a new notification. A start cannot be submitted twice concurrently; native batches can be consumed once. Unsent batches expire after two minutes, and automatic batches cannot dispatch after the presentation has stopped. A room/account switch cancels a pending frontend delivery.

HTTPS requests time out after ten seconds and do not follow redirects or retry automatically. Failures do not stop the presentation. Slack confirms a successful post; Teams displays request acceptance. Timeouts/ambiguous failures say that delivery is unconfirmed because a manual resend can duplicate a post. **Resend join URL** is an explicit new request. Test sending is also an explicit external post, including when automatic sending is off.

## Storage and disabling

The native Security framework stores a JSON setting (name, enabled flag, webhook URL) as a generic Keychain password under service `com.layertalk.channel-notifications.v1`, with an account/room/provider key. The frontend receives only the name, provider, and enabled flag; the URL is accepted on save and is never returned. It is not written to localStorage, shared window events, application logs, or LayerTalk servers.

Stop the presentation before editing. Uncheck automatic sending and save to disable it, or delete a destination to remove its Keychain record. Signing out hides that account's settings; signing back into the same account restores them. Delete destinations before deleting the LayerTalk account if you also want to remove the local credentials. Disabling/deleting does not recall an HTTP request already sent or remove existing channel messages. Manage posted messages in Slack/Teams.

## Verification

Automated coverage uses mocked Tauri commands and a local HTTP fixture, never real Slack/Teams channels. The native `keychain_round_trip` test is ignored by default and can be run explicitly; it creates and removes a unique dummy entry, never accesses existing credentials, and never sends a message.

```sh
# From repository root
npm exec vitest run apps/presenter-app/src/lib/notifications.test.tsx apps/presenter-app/src/components/RoomNotifications.test.tsx
# From apps/presenter-app/src-tauri (to load the macOS deployment-target config)
cargo test --locked --lib notifications::
cargo test --locked --lib notifications::integration_tests::keychain_round_trip -- --ignored
```

Before submission, verify on a signed sandbox build with designated test channels: Keychain save/read/delete after relaunch; Japanese/English preview; Slack post and Teams downstream post; duplicate-click prevention; stop/start resending; disabled/new room; separate account; expired webhook; one destination failing; offline/timeout without interrupting slides. Never use a production channel implicitly for tests.

### Verification recorded during implementation (2026-09-13)

- Presenter and audience-web TypeScript checks passed.
- Notification hook/component tests (9 cases) and existing legal-content tests (11 cases) passed.
- Six native notification tests passed, including the loopback HTTP fixture and temporary Keychain round trip. These ran outside the agent sandbox; they do not establish App Sandbox compatibility.
- Release compilation and the Mac App Store configuration's `.app` bundle build passed. The generated app launched to its login screen.
- Still to verify with the release signing identity and designated test destinations: notification UI after login, Keychain access in the signed App Sandbox build, actual Slack posting, and Teams workflow completion. The locally generated bundle did not expose sandbox entitlements in `codesign -d --entitlements`; use the existing signing workflow before the sandbox checks. The updated privacy page source has not been published by this task.
