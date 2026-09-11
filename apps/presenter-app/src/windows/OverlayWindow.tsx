import {
  parseCustomStampKey,
  resolveRoomStampImageUrl,
  roomStampUrl,
  useComments,
  useRoomStamps,
  useStampChannel,
  type Comment,
  type ModerationRules,
} from "@layertalk/shared";
import { useCallback, useEffect, useRef, useState } from "react";

import { QRCodeCanvas } from "qrcode.react";
import { renderJoinQrBitmap } from "../lib/join-qr-bitmap";
import { startSelftestPump } from "../lib/selftest-pump";
import { useDocumentLang, useMessages } from "../i18n";
import { audienceUrl } from "../lib/audience";
import { useRoomBranding } from "../lib/branding";
import {
  loadSettings,
  OVERLAY_DEFAULTS,
  onSettingsChanged,
  onTestComment,
  onTestStamp,
  sendQuestionToPanel,
  type PresenterSettings,
} from "../lib/settings";
import { clientId, supabase } from "../lib/supabase";
import {
  getPresentationState,
  isOverlaySelftest,
  onOverlayKeepalive,
  onOverlayPeek,
  onPresentationStateChanged,
  overlayBurstEmoji,
  overlayBurstImage,
  overlayCacheStampImage,
  overlayClear,
  overlayPushBubble,
  overlayPushComment,
  overlaySetJoinQr,
  overlaySetPeekCard,
  refitOverlay,
} from "../lib/tauri";

/** スライドに出す QR の一辺。`JoinQrCard` の `size` と揃えること。 */
const QR_SIZE = 220;

export function OverlayWindow() {
  const [settings, setSettings] = useState<PresenterSettings>(loadSettings);
  const [live, setLive] = useState(false);
  const [peeking, setPeeking] = useState(false);
  const [moderation, setModeration] = useState<ModerationRules | null>(null);

  // 参加QRカードのロゴ・色・LayerTalk表記。窓をまたぐ伝達はフックの中の Tauri イベント。
  const { branding } = useRoomBranding(settings.roomId);

  const t = useMessages(settings.language);
  useDocumentLang(settings.language);

  /** ネイティブ描画のとき、参加QR を焼くための隠しキャンバス。 */
  const qrCanvasRef = useRef<HTMLCanvasElement>(null);

  // 設定変更をコントロール窓から受け取る
  useEffect(() => {
    const unlisten = onSettingsChanged(setSettings);
    return () => {
      void unlisten.then((off) => off());
    };
  }, []);

  // 発表の開始・終了（トレイからの終了もここに届く）
  useEffect(() => {
    void getPresentationState().then(setLive);
    const unlisten = onPresentationStateChanged(setLive);
    return () => {
      void unlisten.then((off) => off());
    };
  }, []);

  // モニター確認・プレビューのための一時表示
  useEffect(() => {
    let timer: number | undefined;
    const unlisten = onOverlayPeek((ms) => {
      setPeeking(true);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setPeeking(false), ms);
    });
    return () => {
      window.clearTimeout(timer);
      void unlisten.then((off) => off());
    };
  }, []);

  // 発表が始まったら確認カードは引っ込める
  useEffect(() => {
    if (live) setPeeking(false);
  }, [live]);

  useEffect(() => {
    if (!settings.roomId) { setModeration(null); return; }
    let cancelled = false;
    const roomId = settings.roomId;
    try {
      const cached = localStorage.getItem(`layertalk:event-controls:${roomId}`);
      if (cached) setModeration(JSON.parse(cached) as ModerationRules);
    } catch { /* Ignore a corrupt local cache; the server fetch below replaces it. */ }
    void supabase.from("moderation_rules").select("*").eq("room_id", roomId).single()
      .then(({ data }) => {
        if (!cancelled && data) {
          setModeration(data);
          localStorage.setItem(`layertalk:event-controls:${roomId}`, JSON.stringify(data));
        }
      });
    const channel = supabase.channel(`moderation:${roomId}`).on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "moderation_rules", filter: `room_id=eq.${roomId}` },
      ({ new: row }) => {
        setModeration(row as ModerationRules);
        localStorage.setItem(`layertalk:event-controls:${roomId}`, JSON.stringify(row));
      },
    ).subscribe();
    return () => { cancelled = true; void supabase.removeChannel(channel); };
  }, [settings.roomId]);

  // ディスプレイ構成が変わったらオーバーレイを貼り直す。
  // 表示先モニターは渡さない（Rust が持っている。理由は refitOverlay のコメント）。
  useEffect(() => {
    const handleResize = () => void refitOverlay();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  /**
   * セルフテスト中は**常設レイヤに触らない**。
   *
   * 参加QR とモニターカードは普段この窓が出し入れを持っているが、セルフテストは
   * ルームもサインインも無しで走るので `showQr` は必ず false になり、
   * **Rust が置いた直後にここが消しに行ってしまう**（実測で踏んだ）。
   */
  const [selftest, setSelftest] = useState<string | null>(null);
  useEffect(() => {
    void isOverlaySelftest().then(setSelftest).catch(() => setSelftest(null));
  }, []);

  /**
   * 発表中の「起きていろ」を受ける。**この窓は一度も表示されないので、macOS は
   * 約 6 秒でページを凍らせる。** 凍ると購読は繋がったままコメントが届かなくなる
   * （実測。`docs/mas-migration-handover.md` の購読スパイク）。起こせるのは
   * ネイティブ側からの IPC だけなので、`start_front_watchdog` が 1 秒ごとに突いている。
   * 受け手が要るわけではないが、**届いていることを確かめられる場所を残しておく。**
   */
  const keepaliveRef = useRef(0);
  useEffect(() => {
    const unlisten = onOverlayKeepalive((seq) => {
      keepaliveRef.current = seq;
    });
    return () => {
      void unlisten.then((off) => off());
    };
  }, []);

  // `pump` だけは描画ではなく**隠れた webview の生存**を計る（この窓は表示すらされない）。
  useEffect(() => {
    if (selftest !== "pump") return;
    return startSelftestPump("overlay");
  }, [selftest]);

  const showComment = useCallback(
    (text: string) => {
      if (settings.displayMode === "bubble") {
        void overlayPushBubble(
          text,
          OVERLAY_DEFAULTS.fontSize,
          OVERLAY_DEFAULTS.opacity,
          OVERLAY_DEFAULTS.bubbleDurationSec,
        );
      } else {
        void overlayPushComment(
          text,
          OVERLAY_DEFAULTS.fontSize,
          OVERLAY_DEFAULTS.opacity,
          OVERLAY_DEFAULTS.flowDurationSec,
        );
      }
    },
    [settings.displayMode],
  );

  const handleInsert = useCallback(
    (comment: Comment) => {
      if (comment.status !== "approved") return;
      if (moderation?.question_only && !comment.is_question) return;
      // 質問は右端のパネルにも積む。流れる演出は通常コメントと同じにする
      // （質問だけ見た目を変えない）。
      if (comment.is_question) {
        void sendQuestionToPanel(comment);
      }
      const delay = (moderation?.display_delay_seconds ?? 0) * 1000;
      if (delay > 0) window.setTimeout(() => showComment(comment.content), delay);
      else showComment(comment.content);
    },
    [moderation, showComment],
  );

  // 発表中だけ購読する。client に null を渡すとフックは何もしない。
  const active = live && !settings.emergencyPaused && Boolean(settings.roomId);

  useComments({
    client: active ? supabase : null,
    roomId: settings.roomId,
    onInsert: handleInsert,
    includeModerated: true,
  });

  /**
   * カスタムスタンプの一覧。
   *
   * ここだけ active ではなく roomId で回す。発表を開始した直後の1発目が
   * 「画像を取りに行ってから出る」ことにならないよう、開始前に温めておきたいため。
   */
  const { stamps: roomStamps, byId: roomStampsById } = useRoomStamps({
    client: settings.roomId ? supabase : null,
    roomId: settings.roomId,
  });

  /**
   * 一覧が変わったら画像を温めておく。やらないと最初のバーストの1フレーム目が
   * 間に合わず、パラパラと遅れて出てくる。
   *
   * webview 描画のときはブラウザキャッシュに載せるだけでよいが、ネイティブ描画では
   * **Rust 側に bytes を渡して CGImage にしておく**（Rust から署名 URL を取りに
   * 行かせない ＝ HTTP クライアントと Supabase セッションを Rust に持たせない）。
   * 200 粒のバーストで毎回復号すると間に合わないので、ここで済ませておく。
   */
  useEffect(() => {
    let cancelled = false;
    const warm = async () => {
      for (const stamp of roomStamps) {
        if (cancelled) return;
        try {
          const response = await fetch(roomStampUrl(supabase, stamp.path));
          if (!response.ok) continue;
          const buffer = await response.arrayBuffer();
          // 128px の PNG なので、まとめて base64 にしても問題にならない大きさ。
          let binary = "";
          for (const byte of new Uint8Array(buffer)) binary += String.fromCharCode(byte);
          if (cancelled) return;
          await overlayCacheStampImage(stamp.id, btoa(binary));
        } catch {
          // 温めの失敗は次のバーストで拾い直す。ここで発表を止めない。
        }
      }
    };
    void warm();
    return () => {
      cancelled = true;
    };
  }, [roomStamps]);

  /**
   * スタンプを1種類ぶん再生する。Broadcast とコントロール窓のテスト送信で共通。
   *
   * カスタムは id しか飛んでこない（URL を Broadcast に載せると、誰でも任意の画像を
   * スライド最前面に描画させられる）。ここで自分の持つ一覧を引いて URL にする。
   */
  const playStamp = useCallback(
    (key: string, count: number) => {
      const id = parseCustomStampKey(key);
      if (id === null) {
        void overlayBurstEmoji(
          key,
          count,
          OVERLAY_DEFAULTS.opacity,
          OVERLAY_DEFAULTS.stampDurationSec,
        );
        return;
      }

      if (!settings.allowCustomStamps) return;

      const roomId = settings.roomId;
      if (!roomId) return;

      const burstResolvedImage = async () => {
        // 登録直後は Broadcast が一覧の同期より先に届くことがある。特に非表示だった
        // オーバーレイを別ディスプレイへ出した直後は、署名 URL の準備が間に合わない。
        // その場で1度だけ一覧を引き直し、最初のバーストを空振りさせない。
        const url = await resolveRoomStampImageUrl(
          supabase,
          roomId,
          id,
          roomStampsById.get(id),
        );
        // 削除済み・本当に未知の id は黙って捨てる
        if (!url) return;
        // ネイティブ側は id で引く。温めが間に合っていない（登録直後など）ときの
        // ために、ここでも一度だけ流し込んでからバーストする。同じ id の再送は
        // Rust 側が捨てるので、二重に復号されることはない。
        try {
          const response = await fetch(url);
          if (response.ok) {
            const buffer = await response.arrayBuffer();
            let binary = "";
            for (const byte of new Uint8Array(buffer)) binary += String.fromCharCode(byte);
            await overlayCacheStampImage(id, btoa(binary));
          }
        } catch {
          // 取得できなくても、温め済みならバーストは通る。
        }
        void overlayBurstImage(
          id,
          count,
          OVERLAY_DEFAULTS.opacity,
          OVERLAY_DEFAULTS.stampDurationSec,
        );
      };

      void burstResolvedImage().catch(() => {
        // 一覧・署名 URL の取得失敗は次回の hydrate / バーストで再試行する。
        // 通常の絵文字やコメントまで止めない。
      });
    },
    [settings.allowCustomStamps, settings.roomId, roomStampsById],
  );

  useStampChannel({
    client: active ? supabase : null,
    roomId: settings.roomId,
    clientId,
    onStamp: (payload) => playStamp(payload.emoji, payload.count),
  });

  // 表示モードを切り替えたら、いま流れているものは片付ける。
  // 描画は Rust 側なので、片付けも Rust に頼む。
  useEffect(() => {
    void overlayClear();
  }, [settings.displayMode]);

  // 終了したら流れているものを全部消す（次に開始したとき残骸が出ない）
  useEffect(() => {
    if (!live || settings.emergencyPaused) void overlayClear();
  }, [live, settings.emergencyPaused]);

  // コントロール窓の「テスト送信」からスタンプを受け取る
  useEffect(() => {
    const unlisten = onTestStamp(({ emoji, count }) => playStamp(emoji, count));
    return () => {
      void unlisten.then((off) => off());
    };
  }, [playStamp]);

  // Supabase を介さず、現在選択中のコメント表示スタイルを確認する。
  useEffect(() => {
    const unlisten = onTestComment((text) => {
      showComment(text);
    });
    return () => {
      void unlisten.then((off) => off());
    };
  }, [showComment]);

  const monitorLabel = settings.monitorName ?? t.monitor.primary;

  // 右端は質問パネルの領域なので、QR は左下に逃がす。
  // peek 中にも出して、発表前でも置き場所を確認できるようにする。
  const joinUrl = audienceUrl(settings.roomCode);
  const showQr = settings.showJoinQr && Boolean(joinUrl) && (live || peeking);

  /**
   * ネイティブ描画のときは、参加QR のカードを**キャンバスに焼いて Rust へ渡す**。
   * QR は1ピクセル狂うと読み取れないので、`qrcode.react` の出力をそのまま使う
   * （詳細は `lib/join-qr-bitmap.ts`）。
   *
   * **常設レイヤなので、消す責任もこちらにある。** `showQr` が false のときは
   * null を送らないとスライドに残り続ける。
   */
  useEffect(() => {
    if (selftest) return;
    if (!showQr || !joinUrl || !settings.roomCode) {
      void overlaySetJoinQr(null);
      return;
    }

    let cancelled = false;
    const send = async () => {
      const qr = qrCanvasRef.current;
      if (!qr) return;
      // 署名 URL の `<img>` を canvas に描くとキャンバスが汚染され toDataURL が落ちる。
      // blob 経由の ImageBitmap なら汚染しない。
      let logo: ImageBitmap | null = null;
      if (branding?.logoUrl) {
        try {
          const response = await fetch(branding.logoUrl);
          if (response.ok) logo = await createImageBitmap(await response.blob());
        } catch {
          // ロゴが出ないだけ。QR は出す。
        }
      }
      if (cancelled) return;
      const png = renderJoinQrBitmap({
        qr,
        qrSize: QR_SIZE,
        code: settings.roomCode!,
        label: t.qr.scan,
        brandColor: branding?.brand_color ?? "#6B8AFF",
        logo,
        hideLayerTalk: branding?.hide_layertalk_branding ?? false,
        scale: window.devicePixelRatio || 2,
      });
      logo?.close();
      if (cancelled || !png) return;
      void overlaySetJoinQr(png);
    };
    // `QRCodeCanvas` が描き終わってから読む。
    const timer = window.setTimeout(() => void send(), 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [selftest, showQr, joinUrl, settings.roomCode, branding, t.qr.scan]);

  /**
   * モニター確認カード。**`monitorLabel` は訳さない**（罠 #12）—— `ディスプレイ N` は
   * `settings.monitorName` に保存されて文字列一致で照合される ID。
   */
  useEffect(() => {
    if (selftest) return;
    if (peeking && !live) {
      void overlaySetPeekCard(t.monitor.peek, monitorLabel);
    } else {
      void overlaySetPeekCard(null, null);
    }
  }, [selftest, peeking, live, t.monitor.peek, monitorLabel]);

  return (
    <div className="overlay-root relative h-screen w-screen overflow-hidden bg-transparent">
      {/* ネイティブ描画のとき、カードを焼くために QR だけ画面外に描いておく。
          `hidden` にすると描画されず、キャンバスが空のまま焼かれる。 */}
      {showQr && joinUrl && (
        <div className="pointer-events-none absolute opacity-0" aria-hidden style={{ left: -9999, top: -9999 }}>
          <QRCodeCanvas
            ref={qrCanvasRef}
            value={joinUrl}
            size={QR_SIZE}
            marginSize={2}
            level="M"
            bgColor="#ffffff"
            fgColor="#0b0d12"
          />
        </div>
      )}
    </div>
  );
}
