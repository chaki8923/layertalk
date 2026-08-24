import type { Locale, PresentationReport } from "@layertalk/shared";

type ReportHtmlInput = {
  report: PresentationReport;
  roomTitle: string | null;
  roomCode: string | null;
  locale: Locale;
  captures: Record<string, string | null>;
};

const escapeHtml = (value: unknown) => String(value)
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;")
  .replace(/'/g, "&#39;");

const elapsedSeconds = (startedAt: string, createdAt: string) => Math.max(
  0,
  Math.floor((new Date(createdAt).getTime() - new Date(startedAt).getTime()) / 1000),
);

const formatElapsed = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

export function generatePresentationReportHtml({ report, roomTitle, roomCode, locale, captures }: ReportHtmlInput) {
  const ja = locale === "ja";
  const { session } = report;
  const questions = report.comments.filter((comment) => comment.is_question);
  const dateLocale = ja ? "ja-JP" : "en-US";
  const started = new Date(session.started_at).toLocaleString(dateLocale);
  const ended = session.ended_at ? new Date(session.ended_at).toLocaleString(dateLocale) : "—";
  const durationSeconds = session.ended_at
    ? Math.max(0, Math.floor((new Date(session.ended_at).getTime() - new Date(session.started_at).getTime()) / 1000))
    : 0;
  const statusText = (status: string, questionStatus: string | null) => {
    const moderation = status === "approved" ? "" : ja
      ? status === "pending" ? "・承認待ち" : "・非表示"
      : status === "pending" ? " · Pending approval" : " · Hidden";
    const answered = questionStatus === "answered";
    return `${answered ? (ja ? "回答済み" : "Answered") : (ja ? "未回答" : "Open")}${moderation}`;
  };
  const questionCards = questions.map((question, index) => {
    const elapsed = formatElapsed(elapsedSeconds(session.started_at, question.created_at));
    const capture = captures[question.id];
    return `<article class="question">
      <div class="visual">${capture
        ? `<img src="${capture}" alt="${ja ? "質問到着時のスライド" : "Slide when the question arrived"}">`
        : `<div class="missing">${ja ? "スライド画像なし" : "No slide image"}</div>`}</div>
      <div class="question-body">
        <div class="eyebrow"><span>${ja ? `質問 ${index + 1}` : `Question ${index + 1}`}</span><time>+${elapsed}</time></div>
        <h2>${escapeHtml(question.content)}</h2>
        <div class="meta"><span>${escapeHtml(statusText(question.status, question.question_status))}</span><span>♥ ${question.likes_count}</span></div>
      </div>
    </article>`;
  }).join("\n");

  return `<!doctype html>
<html lang="${ja ? "ja" : "en"}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${escapeHtml(roomTitle || (ja ? "LayerTalk 発表レポート" : "LayerTalk presentation report"))}</title>
  <style>
    :root{color-scheme:light;--ink:#172033;--muted:#667085;--line:#e5e9f2;--brand:#536dfe;--paper:#fff;--wash:#f5f7fb}
    *{box-sizing:border-box}body{margin:0;background:var(--wash);color:var(--ink);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans JP",sans-serif;line-height:1.6}
    main{width:min(1040px,calc(100% - 32px));margin:40px auto 80px}.brand{color:var(--brand);font-size:13px;font-weight:800;letter-spacing:.08em;text-transform:uppercase}
    h1{margin:5px 0 4px;font-size:clamp(28px,4vw,42px);line-height:1.2}.sub{margin:0;color:var(--muted)}
    .facts{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:28px 0}.fact{padding:18px;border:1px solid var(--line);border-radius:18px;background:var(--paper)}
    .fact b{display:block;font-size:26px;line-height:1.2}.fact span{color:var(--muted);font-size:12px}.session{margin:0 0 32px;color:var(--muted);font-size:12px}
    .section-title{margin:0 0 14px;font-size:18px}.questions{display:grid;gap:18px}.question{overflow:hidden;border:1px solid var(--line);border-radius:22px;background:var(--paper);box-shadow:0 10px 30px rgba(23,32,51,.05)}
    .visual{aspect-ratio:16/9;background:#111827;display:grid;place-items:center}.visual img{display:block;width:100%;height:100%;object-fit:contain}.missing{color:#aeb7c8;font-size:13px}
    .question-body{padding:20px 22px 22px}.eyebrow,.meta{display:flex;justify-content:space-between;gap:16px;color:var(--muted);font-size:12px}.eyebrow span{color:var(--brand);font-weight:800}.question h2{margin:10px 0 16px;font-size:20px;line-height:1.55;white-space:pre-wrap;overflow-wrap:anywhere}
    .empty{padding:48px;border:1px dashed var(--line);border-radius:22px;background:var(--paper);color:var(--muted);text-align:center}footer{margin-top:30px;color:var(--muted);font-size:11px;text-align:center}
    @media(max-width:700px){main{margin-top:24px}.facts{grid-template-columns:repeat(2,1fr)}.fact b{font-size:22px}.question-body{padding:16px}.question h2{font-size:17px}}
    @media print{body{background:#fff}main{width:100%;margin:0}.question{break-inside:avoid;box-shadow:none;margin-bottom:16px}}
  </style>
</head>
<body><main>
  <header><div class="brand">LayerTalk</div><h1>${escapeHtml(roomTitle || (ja ? "発表レポート" : "Presentation report"))}</h1><p class="sub">${ja ? "質問が届いた瞬間のスライドと質問内容" : "Questions paired with the slide visible when each arrived"}</p></header>
  <section class="facts">
    <div class="fact"><b>${report.totals.questions}</b><span>${ja ? "質問" : "Questions"}</span></div>
    <div class="fact"><b>${report.totals.openQuestions}</b><span>${ja ? "未回答" : "Open"}</span></div>
    <div class="fact"><b>${report.totals.comments}</b><span>${ja ? "コメント全体" : "All comments"}</span></div>
    <div class="fact"><b>${report.peakMinute === null ? "—" : `${report.peakMinute}${ja ? "分" : "m"}`}</b><span>${ja ? "反応ピーク" : "Activity peak"}</span></div>
  </section>
  <p class="session">${ja ? "ルーム" : "Room"}: ${escapeHtml(roomCode ?? "——")}　·　${escapeHtml(started)} – ${escapeHtml(ended)}　·　${ja ? "発表時間" : "Duration"} ${formatElapsed(durationSeconds)}　·　${ja ? "スタンプ" : "Stamps"} ${report.totals.stamps}</p>
  <h2 class="section-title">${ja ? "質問一覧" : "Questions"}</h2>
  <section class="questions">${questionCards || `<div class="empty">${ja ? "この発表には質問がありませんでした。" : "No questions were received in this presentation."}</div>`}</section>
  <footer>${ja ? "このHTMLはLayerTalkがローカルで生成しました。画像を含む自己完結ファイルです。" : "Generated locally by LayerTalk. This is a self-contained file including its images."}</footer>
</main></body></html>`;
}
