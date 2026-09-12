/**
 * Mac App Store 版のフロントエンドに、入っていてはいけないものが入っていないか確かめる。
 *
 *   npm run verify:mas-bundle
 *
 * 守っているのは2つ:
 *
 * - **App Store 2.4.5(vi)**「独自のコピー防止を実装してはならない」。直接配布版は
 *   Ed25519 で署名した権利リースをオフライン検証している（`billing.direct.ts`）。
 *   使っていなくても**バンドルに入っていれば見られる**ので、MAS 版からはコードごと
 *   消えている必要がある。分離は Vite の alias（`@layertalk/billing-channel`）1本に
 *   依存していて、import を1つ足すだけで静かに壊れる。
 * - **App Store 3.1.1**「アプリ内から別の決済手段へ誘導してはならない」。
 *   Stripe の checkout エンドポイントが MAS バンドルに残っていてはいけない。
 *
 * 引き継ぎメモには「スキャン済み」と書いてあるが、それは一度きりの手作業だった。
 * ここでは再実行できる形にして、退行したら落ちるようにする。
 *
 * `dist/` は汚さない。一時ディレクトリへビルドして、読み終わったら消す。
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const appDir = join(here, "..", "apps", "presenter-app");

/**
 * 判定に使う文字列。**ソースに実在するリテラルだけを選ぶこと。**
 * 識別子（`importSPKI` など）は minify で消えるので判定に使えない。
 */
const FORBIDDEN = [
  { needle: "BEGIN PUBLIC", why: "Ed25519 の権利リース公開鍵（2.4.5(vi) 独自コピー防止）" },
  { needle: "EdDSA", why: "権利リースの署名検証アルゴリズム（2.4.5(vi)）" },
  { needle: "/api/billing/checkout", why: "Stripe Checkout の導線（3.1.1）" },
];

const REQUIRED = [
  { needle: "storekit_purchase", why: "StoreKit の購入経路" },
  { needle: "/api/billing/app-store/fulfill", why: "Apple 署名トランザクションのサーバ検証" },
];

/**
 * `Stripe` という語そのものは**判定に使わない。**
 * `EventPassPurchaseSheet` の文言は三項演算子なので、`isMasBuild` が false 側の
 * 文字列もバンドルに残る。禁止すると直しようのない失敗になる。
 */

const outDir = mkdtempSync(join(tmpdir(), "layertalk-mas-"));
let failures = [];

try {
  console.log("Building the presenter frontend with LAYERTALK_DISTRIBUTION_CHANNEL=mas…");
  execFileSync("npx", ["vite", "build", "--outDir", outDir, "--emptyOutDir"], {
    cwd: appDir,
    stdio: "inherit",
    env: {
      ...process.env,
      LAYERTALK_DISTRIBUTION_CHANNEL: "mas",
      // vite.config.ts の MAS ガードを満たすためだけの値。バンドルの中身の判定には効かない。
      VITE_AUDIENCE_BASE_URL: process.env.VITE_AUDIENCE_BASE_URL || "https://verify.invalid",
      VITE_APPLE_EVENT_PASS_PRODUCT_ID: process.env.VITE_APPLE_EVENT_PASS_PRODUCT_ID || "verify.invalid.event_pass",
    },
  });

  const assetsDir = join(outDir, "assets");
  const scripts = readdirSync(assetsDir).filter((name) => name.endsWith(".js"));
  if (scripts.length === 0) throw new Error(`No JavaScript was emitted into ${assetsDir}`);
  const bundle = scripts.map((name) => readFileSync(join(assetsDir, name), "utf8")).join("\n");

  console.log(`\nScanned ${scripts.length} script(s), ${bundle.length.toLocaleString()} characters.\n`);

  for (const { needle, why } of FORBIDDEN) {
    if (bundle.includes(needle)) {
      failures.push(`MUST NOT ship in the MAS bundle: ${JSON.stringify(needle)} — ${why}`);
      console.error(`  ✗ ${needle} — found (${why})`);
    } else {
      console.log(`  ✓ ${needle} — absent`);
    }
  }
  for (const { needle, why } of REQUIRED) {
    if (bundle.includes(needle)) {
      console.log(`  ✓ ${needle} — present`);
    } else {
      failures.push(`MISSING from the MAS bundle: ${JSON.stringify(needle)} — ${why}`);
      console.error(`  ✗ ${needle} — missing (${why})`);
    }
  }
} finally {
  rmSync(outDir, { recursive: true, force: true });
}

if (failures.length > 0) {
  console.error("\nThe Mac App Store bundle is not clean:\n");
  for (const failure of failures) console.error(`  - ${failure}`);
  console.error("\nThe channel split lives in apps/presenter-app/vite.config.ts (the");
  console.error("@layertalk/billing-channel alias). A direct import of ./billing.direct.ts");
  console.error("anywhere in the graph will pull the Stripe and Ed25519 code back in.");
  process.exit(1);
}

console.log("\nThe Mac App Store bundle is clean.");
