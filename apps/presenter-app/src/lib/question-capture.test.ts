import { describe, expect, it } from "vitest";

import { questionCaptureErrorMessage, questionCapturePendingMessage, screenCapturePermissionTargetName, shouldOpenScreenCaptureSettings } from "./question-capture";

describe("shouldOpenScreenCaptureSettings", () => {
  it("opens settings only when supported capture is not usable", () => {
    expect(shouldOpenScreenCaptureSettings({ supported: true, granted: false, restartRequired: false, permissionTarget: "layerTalk" })).toBe(true);
    expect(shouldOpenScreenCaptureSettings({ supported: true, granted: false, restartRequired: true, permissionTarget: "launchingApp" })).toBe(true);
    expect(shouldOpenScreenCaptureSettings({ supported: true, granted: true, restartRequired: false, permissionTarget: "layerTalk" })).toBe(false);
    expect(shouldOpenScreenCaptureSettings({ supported: false, granted: false, restartRequired: false, permissionTarget: "layerTalk" })).toBe(false);
  });
});

describe("screen capture guidance", () => {
  it("names the launching app for direct development builds", () => {
    expect(screenCapturePermissionTargetName("launchingApp", "ja")).toContain("起動元アプリ");
    expect(questionCaptureErrorMessage({
      kind: "permissionDenied",
      detail: "denied",
      permissionTarget: "launchingApp",
    }, "ja")).toContain("ターミナル");
  });

  it("keeps packaged builds and non-permission failures distinct", () => {
    expect(screenCapturePermissionTargetName("layerTalk", "en")).toBe("LayerTalk");
    expect(questionCaptureErrorMessage({
      kind: "displayUnavailable",
      detail: "missing",
      permissionTarget: "layerTalk",
    }, "ja")).toContain("ディスプレイ");
  });
});

describe("questionCapturePendingMessage", () => {
  it("points at the macOS dialog, not the settings pane, when capture is blocked", () => {
    // 設定は既にオンになっているので「システム設定を開け」と言っても直らない。
    for (const reason of ["captureBlocked", "streamStopped"] as const) {
      const message = questionCapturePendingMessage(reason, "ja");
      expect(message).toContain("許可");
      expect(message).not.toContain("システム設定");
    }
  });

  it("names the macOS version requirement when the one-shot snapshot is unavailable", () => {
    expect(questionCapturePendingMessage("snapshotFailed", "ja")).toContain("macOS 14");
    expect(questionCapturePendingMessage("snapshotFailed", "en")).toContain("macOS 14");
  });

  it("falls back to the not-ready wording for the first frame and for an absent reason", () => {
    expect(questionCapturePendingMessage("awaitingFirstFrame", "ja")).toContain("画面収録の準備");
    expect(questionCapturePendingMessage(undefined, "ja")).toContain("画面収録の準備");
  });

  it("never suggests stopping the presentation", () => {
    const reasons = ["awaitingFirstFrame", "captureBlocked", "streamStopped", "snapshotFailed"] as const;
    for (const reason of reasons) {
      expect(questionCapturePendingMessage(reason, "ja")).toContain("発表は継続できます");
      expect(questionCapturePendingMessage(reason, "en")).toContain("presentation can continue");
    }
  });
});
