import { describe, expect, it } from "vitest";

import { questionCaptureErrorMessage, screenCapturePermissionTargetName, shouldOpenScreenCaptureSettings } from "./question-capture";

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
