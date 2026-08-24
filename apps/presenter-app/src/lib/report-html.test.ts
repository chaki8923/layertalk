import { describe, expect, it } from "vitest";
import type { PresentationReport } from "@layertalk/shared";

import { generatePresentationReportHtml } from "./report-html";

const report: PresentationReport = {
  session: {
    id: "11111111-1111-1111-1111-111111111111",
    room_id: "22222222-2222-2222-2222-222222222222",
    owner_id: "33333333-3333-3333-3333-333333333333",
    entitlement_id: null,
    entitlement_snapshot: { paid: true },
    started_at: "2026-08-24T01:00:00.000Z",
    ended_at: "2026-08-24T01:12:00.000Z",
    created_at: "2026-08-24T01:00:00.000Z",
  },
  comments: [{
    id: "44444444-4444-4444-4444-444444444444",
    room_id: "22222222-2222-2222-2222-222222222222",
    content: "<script>alert('x')</script> この数字の根拠は？",
    is_question: true,
    likes_count: 3,
    status: "approved",
    question_status: "open",
    presentation_session_id: "11111111-1111-1111-1111-111111111111",
    moderated_by: null,
    moderated_at: null,
    created_at: "2026-08-24T01:02:05.000Z",
  }],
  stampEvents: [],
  peakMinute: 2,
  totals: { comments: 1, questions: 1, openQuestions: 1, stamps: 8 },
};

describe("generatePresentationReportHtml", () => {
  it("embeds captures, elapsed time, and escaped question text in one HTML document", () => {
    const html = generatePresentationReportHtml({
      report,
      roomTitle: "Demo & Talk",
      roomCode: "ABC123",
      locale: "ja",
      captures: { "44444444-4444-4444-4444-444444444444": "data:image/jpeg;base64,AA==" },
    });

    expect(html).toContain("data:image/jpeg;base64,AA==");
    expect(html).toContain("+2:05");
    expect(html).toContain("Demo &amp; Talk");
    expect(html).toContain("&lt;script&gt;alert(&#39;x&#39;)&lt;/script&gt;");
    expect(html).not.toContain("<script>alert");
  });
});
