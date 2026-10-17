import type { Messages } from "../i18n";
import { deviceNoun } from "./platform";
import type { MonitorInfo } from "./tauri";

/**
 * 表示先モニターの解決と、行に出す名前。
 *
 * `MonitorInfo.name` は **照合用の ID で文言ではない**（罠 #12）。Windows は
 * GDI のデバイス名（`\\.\DISPLAY1`）、macOS は機種名（「JAPANNEXT.MNT」「内蔵Retina
 * ディスプレイ」）で、**どちらも*どの画面か*を人に教えない。** 画面に出すのは
 * ここが `is_primary` から作る役割名だけ。保存するのも Rust へ渡すのも `name` のまま。
 *
 * **外部が2台あって解像度も同じだと、行だけでは見分けられない。** 機種名を出さないと
 * 決めた以上それは避けられないので、見分けは選んだときの確認の枠（`peek_overlay`）に任せる。
 */

/**
 * 表示先が選ばれていない（＝「自動」）ときに実際に出る画面。
 *
 * **外部ディスプレイを優先する。** 会議室ではプロジェクターや大型モニターを挿すが、
 * それは主ディスプレイではないので、主へ落とすと手元の画面にだけコメントが出る。
 *
 * **Rust の `native_overlay::auto_screen`（macOS）と `auto_monitor`（Windows）と
 * 同じ規則であること。** どれかだけを変えると、一覧に出る「いまの出力先」と
 * 実際の表示先がずれる。
 */
export function resolveAutoMonitor(monitors: MonitorInfo[]): MonitorInfo | null {
  return externalMonitors(monitors)[0] ?? monitors[0] ?? null;
}

/**
 * 外部ディスプレイ。**先頭が「自動」そのもの**（`resolveAutoMonitor` が選ぶ画面）で、
 * コントロール窓もこの順で行を並べる。空なら選ぶものが無い＝ラジオを出さない
 * （Windows のミラー表示は両方 primary 判定になるのでここに来る）。
 */
export const externalMonitors = (monitors: MonitorInfo[]): MonitorInfo[] =>
  monitors.filter((monitor) => !monitor.is_primary);

/**
 * 保存値から、実際の表示先と「選んだ画面が消えているか」を返す。
 *
 * `missing` は **明示的に選んだ画面が一覧に無いとき**だけ true。自動（null）は
 * 選んでいないので false。Rust 側も見つからない名前は自動へ落とすので、
 * `monitor` はそのとき実際に出る画面と一致する。
 */
export function resolveTarget(
  monitors: MonitorInfo[],
  monitorName: string | null,
): { monitor: MonitorInfo | null; missing: boolean } {
  if (monitorName === null) return { monitor: resolveAutoMonitor(monitors), missing: false };
  const found = monitors.find((monitor) => monitor.name === monitorName);
  if (found) return { monitor: found, missing: false };
  return { monitor: resolveAutoMonitor(monitors), missing: monitors.length > 0 };
}

/**
 * 行に出す名前。**役割だけで決める**（機種名は使わない）。
 * 外部が複数あるときだけ番号を振る。
 */
export function describeMonitor(monitor: MonitorInfo, monitors: MonitorInfo[], t: Messages): string {
  if (monitor.is_primary) return t.monitor.thisScreen(deviceNoun());

  const externals = externalMonitors(monitors);
  if (externals.length <= 1) return t.monitor.external;
  const index = externals.findIndex((candidate) => candidate.name === monitor.name);
  return t.monitor.externalNumbered(index < 0 ? externals.length : index + 1);
}

/** 「いまの出力先」や「◯◯に表示中」に出す名前。解決できなければ null。 */
export function describeTarget(
  monitors: MonitorInfo[],
  monitorName: string | null,
  t: Messages,
): string | null {
  const { monitor } = resolveTarget(monitors, monitorName);
  return monitor ? describeMonitor(monitor, monitors, t) : null;
}

/** 行の右端に出す `1920×1080`。 */
export const monitorSpec = (monitor: MonitorInfo): string => `${monitor.width}×${monitor.height}`;
