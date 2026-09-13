import { describe, expect, it } from "vitest";
import type { PresentationReport } from "@layertalk/shared";

import { generatePresentationReportHtml, hasQuestionCapture } from "./report-html";

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
    status_before_hidden: null,
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
  it("requires at least one actual image but allows partial captures", () => {
    expect(hasQuestionCapture({ first: null, second: null })).toBe(false);
    expect(hasQuestionCapture({ first: "data:image/jpeg;base64,AA==", second: null })).toBe(true);
  });

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

  it("groups questions with the exact same slide capture", () => {
    const second = {
      ...report.comments[0],
      id: "55555555-5555-5555-5555-555555555555",
      content: "補足の質問です",
      likes_count: 7,
      question_status: "answered" as const,
      created_at: "2026-08-24T01:03:00.000Z",
    };
    const groupedReport = {
      ...report,
      comments: [report.comments[0], second],
      totals: { ...report.totals, comments: 2, questions: 2 },
    };
    const capture = "data:image/jpeg;base64,SAME";
    const html = generatePresentationReportHtml({
      report: groupedReport,
      roomTitle: "Demo",
      roomCode: "ABC123",
      locale: "ja",
      captures: {
        [report.comments[0].id]: capture,
        [second.id]: capture,
      },
    });

    expect(html.match(/<article class="slide">/g)).toHaveLength(1);
    expect(html.match(/data:image\/jpeg;base64,SAME/g)).toHaveLength(1);
    expect(html).toContain("質問 1");
    expect(html).toContain("質問 2");
    expect(html).toContain("補足の質問です");
    expect(html).toContain("+3:00");
    expect(html).toContain("回答済み");
    expect(html).toContain("♥ 7");
  });

  it("keeps different captures separate and groups a returning slide with its first card", () => {
    const questions = [
      report.comments[0],
      { ...report.comments[0], id: "55555555-5555-5555-5555-555555555555", content: "スライドBへの質問" },
      { ...report.comments[0], id: "66666666-6666-6666-6666-666666666666", content: "スライドAへの追加質問" },
    ];
    const html = generatePresentationReportHtml({
      report: { ...report, comments: questions },
      roomTitle: null,
      roomCode: null,
      locale: "ja",
      captures: {
        [questions[0].id]: "data:image/jpeg;base64,SLIDE_A",
        [questions[1].id]: "data:image/jpeg;base64,SLIDE_B",
        [questions[2].id]: "data:image/jpeg;base64,SLIDE_A",
      },
    });

    expect(html.match(/<article class="slide">/g)).toHaveLength(2);
    expect(html.match(/data:image\/jpeg;base64,SLIDE_A/g)).toHaveLength(1);
    expect(html.indexOf("スライドAへの追加質問")).toBeLessThan(html.indexOf("スライドBへの質問"));
  });

  it("does not group questions whose slide capture is missing", () => {
    const questions = [
      report.comments[0],
      { ...report.comments[0], id: "55555555-5555-5555-5555-555555555555", content: "画像のない質問2" },
    ];
    const html = generatePresentationReportHtml({
      report: { ...report, comments: questions },
      roomTitle: null,
      roomCode: null,
      locale: "ja",
      captures: {},
    });

    expect(html.match(/<article class="slide">/g)).toHaveLength(2);
    expect(html.match(/スライド画像なし/g)).toHaveLength(2);
  });

  it("lists approved questions only and leaves out pending and hidden ones", () => {
    const pending = { ...report.comments[0], id: "77777777-7777-7777-7777-777777777777", content: "承認待ちの質問", status: "pending" as const };
    const hidden = {
      ...report.comments[0],
      id: "88888888-8888-8888-8888-888888888888",
      content: "非表示にした質問",
      status: "hidden" as const,
      status_before_hidden: "approved" as const,
    };
    const html = generatePresentationReportHtml({
      report: { ...report, comments: [report.comments[0], pending, hidden] },
      roomTitle: null,
      roomCode: null,
      locale: "ja",
      captures: {
        [report.comments[0].id]: "data:image/jpeg;base64,APPROVED",
        [pending.id]: "data:image/jpeg;base64,PENDING",
        [hidden.id]: "data:image/jpeg;base64,HIDDEN",
      },
    });

    expect(html.match(/<article class="slide">/g)).toHaveLength(1);
    expect(html).toContain("APPROVED");
    expect(html).not.toContain("承認待ちの質問");
    expect(html).not.toContain("非表示にした質問");
    expect(html).not.toContain("PENDING");
    expect(html).not.toContain("HIDDEN");
  });
});
