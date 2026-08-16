import { ImageResponse } from "next/og";

export const socialCardAlt = "LayerTalk — Bring the room onto your slides";
export const socialCardSize = { width: 1200, height: 630 };
export const socialCardContentType = "image/png";

export function createSocialCardImage() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: "72px 80px",
        color: "#f8fafc",
        background: "#080a10",
        backgroundImage:
          "radial-gradient(circle at 82% 18%, rgba(124, 92, 255, .38), transparent 36%), radial-gradient(circle at 18% 100%, rgba(43, 212, 172, .18), transparent 38%)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
        <div
          style={{
            width: 54,
            height: 54,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: 16,
            color: "#ffffff",
            fontSize: 30,
            fontWeight: 800,
            background: "linear-gradient(135deg, #7c5cff, #a855f7)",
          }}
        >
          L
        </div>
        <span style={{ fontSize: 34, fontWeight: 750, letterSpacing: "-0.04em" }}>LayerTalk</span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
        <div style={{ display: "flex", fontSize: 72, lineHeight: 1.04, fontWeight: 800, letterSpacing: "-0.055em" }}>
          Bring the room onto your slides.
        </div>
        <div style={{ display: "flex", color: "#a9b1c3", fontSize: 27, letterSpacing: "-0.015em" }}>
          Live comments, questions, and reactions for presentations.
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 12, color: "#2bd4ac", fontSize: 22, fontWeight: 700 }}>
        <span style={{ width: 10, height: 10, borderRadius: 999, background: "#2bd4ac" }} />
        LIVE AUDIENCE · ON YOUR SLIDES
      </div>
    </div>,
    socialCardSize,
  );
}
