import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const PROJECT_REF = process.env.LAYERTALK_SUPABASE_PROJECT_REF ?? "xnqduwlagmfaxzsaaicj";
const ACCESS_TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const API_URL = `https://api.supabase.com/v1/projects/${PROJECT_REF}/config/auth`;
const here = dirname(fileURLToPath(import.meta.url));

if (!ACCESS_TOKEN) {
  console.error("SUPABASE_ACCESS_TOKEN is required. Create one at https://supabase.com/dashboard/account/tokens and export it only in your local shell.");
  process.exit(1);
}

const [confirmation, magicLink] = await Promise.all([
  readFile(join(here, "..", "supabase", "templates", "confirmation.html"), "utf8"),
  readFile(join(here, "..", "supabase", "templates", "magic_link.html"), "utf8"),
]);

const headers = {
  Authorization: `Bearer ${ACCESS_TOKEN}`,
  "Content-Type": "application/json",
};

async function authConfig(method = "GET", body) {
  const response = await fetch(API_URL, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 500);
    throw new Error(`Supabase Management API ${method} failed (${response.status}): ${detail}`);
  }
  return response.json();
}

await authConfig("PATCH", {
  external_anonymous_users_enabled: true,
  mailer_subjects_confirmation: "LayerTalk ログインコード / Sign-in code",
  mailer_templates_confirmation_content: confirmation,
  mailer_subjects_magic_link: "LayerTalk ログインコード / Sign-in code",
  mailer_templates_magic_link_content: magicLink,
  mailer_otp_exp: 600,
  mailer_otp_length: 6,
  smtp_max_frequency: 60,
});

const saved = await authConfig();
const checks = {
  anonymous_sign_ins: saved.external_anonymous_users_enabled === true,
  confirmation_template: saved.mailer_templates_confirmation_content === confirmation,
  magic_link_template: saved.mailer_templates_magic_link_content === magicLink,
  otp_expiration: saved.mailer_otp_exp === 600,
  otp_length: saved.mailer_otp_length === 6,
  resend_interval: saved.smtp_max_frequency === 60,
};

if (Object.values(checks).some((value) => !value)) {
  console.error(JSON.stringify({ project: PROJECT_REF, configured: false, checks }, null, 2));
  process.exit(2);
}

console.log(JSON.stringify({ project: PROJECT_REF, configured: true, checks }, null, 2));
