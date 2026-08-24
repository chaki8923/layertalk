import { describe, expect, it } from "vitest";

import { shouldOpenScreenCaptureSettings } from "./question-capture";

describe("shouldOpenScreenCaptureSettings", () => {
  it("opens settings only when supported capture is not usable", () => {
    expect(shouldOpenScreenCaptureSettings({ supported: true, granted: false, restartRequired: false })).toBe(true);
    expect(shouldOpenScreenCaptureSettings({ supported: true, granted: false, restartRequired: true })).toBe(true);
    expect(shouldOpenScreenCaptureSettings({ supported: true, granted: true, restartRequired: false })).toBe(false);
    expect(shouldOpenScreenCaptureSettings({ supported: false, granted: false, restartRequired: false })).toBe(false);
  });
});
