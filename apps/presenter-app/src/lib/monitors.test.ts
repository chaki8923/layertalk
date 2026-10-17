import { describe, expect, it } from "vitest";

import { ja } from "../i18n/ja";
import { describeMonitor, describeTarget, externalMonitors, monitorSpec, resolveAutoMonitor, resolveTarget } from "./monitors";
import type { MonitorInfo } from "./tauri";

const monitor = (over: Partial<MonitorInfo> & Pick<MonitorInfo, "name">): MonitorInfo => ({
  width: 1920,
  height: 1080,
  x: 0,
  y: 0,
  scale: 1,
  is_primary: false,
  ...over,
});

// `name` は実物と同じ「人に読めない ID」を入れておく。macOS は機種名、Windows は
// GDI のデバイス名で、どちらも*どの画面か*を教えない。
const builtIn = monitor({ name: "内蔵Retinaディスプレイ", width: 2940, height: 1912, is_primary: true });
const projector = monitor({ name: "JAPANNEXT.MNT" });
const secondExternal = monitor({ name: String.raw`\\.\DISPLAY3`, width: 1280, height: 720 });
const winPrimary = monitor({ name: String.raw`\\.\DISPLAY1`, is_primary: true });

describe("resolveAutoMonitor", () => {
  // 会議室では挿したプロジェクターが主ディスプレイにならない。ここが主へ落ちると
  // 手元の画面にだけコメントが出て、スライドには何も重ならない。
  it("prefers an external display over the primary one", () => {
    expect(resolveAutoMonitor([builtIn, projector])?.name).toBe(projector.name);
    expect(resolveAutoMonitor([projector, builtIn])?.name).toBe(projector.name);
  });

  it("falls back to the only display when nothing external is attached", () => {
    expect(resolveAutoMonitor([builtIn])?.name).toBe(builtIn.name);
    expect(resolveAutoMonitor([])).toBeNull();
  });

  // コントロール窓は先頭の外部行を「自動」として描くので、ここと順番が一致していること。
  it("takes the first external, which is the row the UI marks as automatic", () => {
    const monitors = [builtIn, projector, secondExternal];
    expect(resolveAutoMonitor(monitors)?.name).toBe(projector.name);
    expect(externalMonitors(monitors)[0]?.name).toBe(projector.name);
  });
});

describe("resolveTarget", () => {
  it("resolves null to the automatic choice without calling it missing", () => {
    expect(resolveTarget([builtIn, projector], null)).toEqual({ monitor: projector, missing: false });
  });

  it("keeps an explicit pick", () => {
    expect(resolveTarget([builtIn, projector], builtIn.name)).toEqual({ monitor: builtIn, missing: false });
  });

  // Rust も見つからない名前は自動へ落とすので、画面に出す先と実際の表示先は一致する。
  it("reports a vanished pick and falls back to the automatic choice", () => {
    expect(resolveTarget([builtIn, projector], "DELL U2720Q")).toEqual({ monitor: projector, missing: true });
  });

  // 一覧がまだ空なだけ（起動直後）を「外れた」と言わない。
  it("stays quiet while the monitor list is still empty", () => {
    expect(resolveTarget([], "DELL U2720Q")).toEqual({ monitor: null, missing: false });
  });
});

describe("describeMonitor", () => {
  // ここが退行すると「内蔵Retinaディスプレイ」「JAPANNEXT.MNT」「\\.\DISPLAY1」が
  // また行に出る。どれも*どの画面か*を発表者に教えない文字列。
  it("never shows the identifier the OS gave us", () => {
    const monitors = [builtIn, projector];
    const labels = monitors.map((m) => describeMonitor(m, monitors, ja));
    expect(labels).toEqual(["このMacの画面", "外部ディスプレイ"]);
    for (const label of labels) {
      for (const id of monitors.map((m) => m.name)) expect(label).not.toContain(id);
    }
  });

  it("names the primary after the device, not after the panel", () => {
    // jsdom の UA は Windows ではないので Mac 側に落ちる（`deviceNoun`）。
    expect(describeMonitor(winPrimary, [winPrimary, projector], ja)).toBe("このMacの画面");
  });

  it("numbers externals only when there is more than one", () => {
    expect(describeMonitor(projector, [builtIn, projector], ja)).toBe(ja.monitor.external);
    const many = [builtIn, projector, secondExternal];
    expect(describeMonitor(projector, many, ja)).toBe(ja.monitor.externalNumbered(1));
    expect(describeMonitor(secondExternal, many, ja)).toBe(ja.monitor.externalNumbered(2));
  });
});

describe("describeTarget", () => {
  it("names the screen the automatic choice lands on", () => {
    expect(describeTarget([winPrimary, projector], null, ja)).toBe(ja.monitor.external);
  });

  it("returns null while no display is known", () => {
    expect(describeTarget([], null, ja)).toBeNull();
  });
});

describe("externalMonitors / monitorSpec", () => {
  // 空なら選ぶものが無い＝コントロール窓はラジオを出さず1文だけにする。
  it("is empty when only the primary is attached", () => {
    expect(externalMonitors([builtIn])).toEqual([]);
  });

  it("formats the resolution without any role suffix", () => {
    expect(monitorSpec(builtIn)).toBe("2940×1912");
    expect(monitorSpec(projector)).toBe("1920×1080");
  });
});
