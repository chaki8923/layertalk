/**
 * App Review へ渡すデモアカウントを作る／更新する／消す。
 *
 *   npm run create:review-account
 *   npm run create:review-account -- --delete
 *
 * **なぜ要るか。** アプリのサインインは既定が確認コード（メール OTP）で、審査員に
 * 受信箱は渡せない。**Supabase にメールのテスト OTP は存在しない**
 * （`auth.sms.test_otp` は SMS 専用かつローカル開発限定）ので、`PresenterAuth` に
 * 併設したパスワードログインが、受信箱なしで審査員を通す唯一の経路になる。
 * そのパスワードを持つアカウントを作るのがこのスクリプト。
 *
 * **冪等。** 既に居たらパスワードだけ差し替える。審査のたびにパスワードは変えるが、
 * アカウントを作り直すと過去のルームや権利まで消えるので、更新で済ませる。
 *
 * サービスロールキーを使う。`apps/audience-web/.env.local` の `SUPABASE_SECRET_KEY`
 * （旧名 `SUPABASE_SERVICE_ROLE_KEY` でも読む。`lib/server/env.ts` と同じ扱い）を見るが、
 * 同名の環境変数があればそちらを優先する。**このキーは絶対にクライアントへ出さない。**
 *
 * メールアドレスとパスワードは `LAYERTALK_REVIEW_EMAIL` / `LAYERTALK_REVIEW_PASSWORD`
 * で渡せる。省略するとアドレスは既定値、パスワードは毎回ランダムに生成する。
 */
import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
// Node 20 には WebSocket グローバルが無く、createClient が Realtime の初期化で落ちる
// （CLAUDE.md の罠 #7。realtime-smoke.mjs と同じく ws を注入する。Node 22 以降なら不要）。
import WS from "ws";

const here = dirname(fileURLToPath(import.meta.url));

/** realtime-smoke.mjs と同じ読み方。`.env.local` は gitignore されている。 */
function readEnv(relativePath, keys) {
  const raw = readFileSync(join(here, "..", relativePath), "utf8");
  const found = {};
  for (const line of raw.split("\n")) {
    const [key, ...rest] = line.split("=");
    if (keys.includes(key?.trim())) found[key.trim()] = rest.join("=").trim();
  }
  return found;
}

let fileEnv = {};
try {
  fileEnv = readEnv("apps/audience-web/.env.local", [
    "NEXT_PUBLIC_SUPABASE_URL",
    "SUPABASE_SECRET_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
  ]);
} catch {
  // .env.local が無くても、環境変数だけで動かせるようにする。
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || fileEnv.NEXT_PUBLIC_SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY
  || process.env.SUPABASE_SERVICE_ROLE_KEY
  || fileEnv.SUPABASE_SECRET_KEY
  || fileEnv.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !secret) {
  console.error("Supabase の URL とサービスロールキーが要る。");
  console.error("apps/audience-web/.env.local に SUPABASE_SECRET_KEY を入れるか、");
  console.error("SUPABASE_SECRET_KEY=... npm run create:review-account のように渡すこと。");
  console.error("（このキーはサーバ専用。クライアントへ出さないこと）");
  process.exit(1);
}

// 既定は、サポート窓口と同じ受信箱に届くプラスアドレス。以前の `appreview@layertalk.app` は
// ドメインに DNS レコードが無く（2026-09-12 に確認）、第三者がドメインを取るとパスワード再設定の
// メールを受け取れてしまう。
const email = (process.env.LAYERTALK_REVIEW_EMAIL || "layertalk0816+appreview@gmail.com").trim().toLowerCase();
const remove = process.argv.includes("--delete");

/**
 * 記号を混ぜない。審査員はこれを手で打つか貼り付ける。**`⌘V` が効かない可能性が
 * 残っている**（Accessory ポリシーでメニューバーが出ないため未実測）ので、
 * 打ち間違えようのない文字種に寄せてある。
 */
function generatePassword() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const bytes = randomBytes(20);
  return `LayerTalk-${[...bytes].map((byte) => alphabet[byte % alphabet.length]).join("")}`;
}

const password = process.env.LAYERTALK_REVIEW_PASSWORD || generatePassword();

const admin = createClient(url, secret, {
  auth: { persistSession: false, autoRefreshToken: false },
  realtime: { transport: WS },
});

/**
 * メールアドレスで既存ユーザーを探す。
 *
 * `listUsers` はページングするので、1 ページ目だけ見て「居ない」と判断しないこと
 * （そのまま createUser すると重複で失敗する）。
 */
async function findByEmail(target) {
  for (let page = 1; page <= 50; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const hit = data.users.find((user) => user.email?.toLowerCase() === target);
    if (hit) return hit;
    if (data.users.length < 200) return null;
  }
  return null;
}

const existing = await findByEmail(email);

if (remove) {
  if (!existing) {
    console.log(`${email} は存在しない。何もしない。`);
    process.exit(0);
  }
  const { error } = await admin.auth.admin.deleteUser(existing.id);
  if (error) {
    console.error("削除できなかった:", error.message);
    // moderation_actions.actor_id を on delete restrict に戻すとここで FK 違反になる。
    console.error("FK 違反なら、20260904035052_allow_presenter_account_deletion.sql が");
    console.error("適用されているか確認すること（actor_id は set null であるべき）。");
    process.exit(1);
  }
  console.log(`削除した: ${email}`);
  process.exit(0);
}

if (existing) {
  const { error } = await admin.auth.admin.updateUserById(existing.id, { password });
  if (error) {
    console.error("パスワードを更新できなかった:", error.message);
    process.exit(1);
  }
  console.log(`既存アカウントのパスワードを更新した（ルームと購入はそのまま）。`);
} else {
  const { error } = await admin.auth.admin.createUser({
    email,
    password,
    // 確認メールを踏ませないため。踏ませると結局受信箱が要る。
    email_confirm: true,
  });
  if (error) {
    console.error("作成できなかった:", error.message);
    process.exit(1);
  }
  console.log("新しい審査用アカウントを作った。");
}

console.log("\n--- docs/app-store-review-notes.md の <REVIEW_EMAIL> / <REVIEW_PASSWORD> へ ---");
console.log(`Email:    ${email}`);
console.log(`Password: ${password}`);
console.log("\nサインイン画面で「パスワードでログイン」に切り替えて使う。");
console.log("審査が終わったら: npm run create:review-account -- --delete");
