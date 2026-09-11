import { ExternalLink, Loader2, LogIn, LogOut, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import type { Locale } from "@layertalk/shared";

import { useMessages } from "../i18n";
import { deleteAccount, openAudiencePage } from "../lib/billing";
import { SignInDialog } from "./SignInDialog";
import { supabase } from "../lib/supabase";

type Props = {
  locale: Locale;
  /** 退会が通ったあとの後始末（ルーム設定を外す）。サインアウトはこの中でやる。 */
  onDeleted: () => void;
  /**
   * 発表中か。**法務リンクは発表中も出したまま**にする（5.1.1(i) はアプリ内から
   * 常に到達できることを求める）。畳むのはサインアウトと退会だけ — どちらも
   * 壇上で誤爆すると発表そのものが止まるうえ、退会ダイアログはスライドの前で開くと操作できない。
   */
  live: boolean;
  /**
   * 本会員（匿名でない）か。匿名のあいだは退会するアカウントがまだ無いので、
   * 削除の代わりにサインインへの導線を出す。法務リンクは**どちらでも常に出す**。
   */
  isPermanent: boolean;
};

/**
 * コントロール窓のいちばん下に置く、アカウントと方針の導線。
 *
 * ここが存在する理由は2つとも App Store の要件:
 * - **5.1.1(v)**: アカウントを作れるアプリは**アプリ内に退会手段**を持つ必要がある。
 *   以前はログアウトしか無かった。
 * - **5.1.1(i)**: プライバシーポリシーへ**アプリ内から**辿れる必要がある。以前は
 *   Event Pass の購入シートの中にしかリンクが無く、購入しない利用者には到達不能だった。
 *
 * 呼び出し側で `{!live && …}` に包むこと。発表中に退会ダイアログが開くと、
 * スライドの前で操作不能になる。
 */
export function AccountFooter({ locale, live, isPermanent, onDeleted }: Props) {
  const t = useMessages(locale);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const [signInOpen, setSignInOpen] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    else if (!open && dialog.open) dialog.close();
  }, [open]);

  const close = () => {
    if (busy) return;
    setOpen(false);
    setConfirmation("");
    setError(null);
  };

  const openPage = (path: string) => {
    void openAudiencePage(path).catch(() => setError(t.account.openFailed));
  };

  const confirmDelete = async () => {
    if (busy || confirmation.trim().toUpperCase() !== t.account.deleteConfirmWord) return;
    setBusy(true);
    setError(null);
    try {
      await deleteAccount();
      // 先にローカルを畳んでからサインアウトする。逆にすると onAuthStateChange が
      // 走ったあとに消えたルームを読みに行って、通信エラーだけが画面に残る。
      onDeleted();
      await supabase.auth.signOut();
      setOpen(false);
    } catch (deleteError) {
      // `status` が無い＝リクエストが飛んでいない（オフライン / CORS）。billing.ts と同じ判定。
      const status = typeof deleteError === "object" && deleteError !== null
        && typeof (deleteError as { status?: unknown }).status === "number"
        ? (deleteError as { status: number }).status
        : undefined;
      if (status === 401) setError(t.account.deleteExpired);
      else if (status === undefined) setError(t.account.deleteOffline);
      else setError(t.account.deleteFailed);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="border-border mt-2 border-t pt-4">
      <p className="text-text-faint text-[10px] font-semibold tracking-wider uppercase">{t.account.title}</p>

      <div className="mt-3 flex flex-wrap gap-x-3 gap-y-2">
        {([
          [t.account.privacy, "/legal/privacy"],
          [t.account.terms, "/legal/terms"],
          [t.account.support, "/support"],
        ] as const).map(([label, path]) => (
          <button
            key={path}
            type="button"
            onClick={() => openPage(path)}
            className="text-brand flex items-center gap-1 text-[10px] font-semibold"
          >
            {label}
            <ExternalLink size={10} />
          </button>
        ))}
      </div>

      {!live && !isPermanent && (
        <div className="mt-4">
          <p className="text-text-faint text-[10px] leading-relaxed">{t.account.signInHint}</p>
          <button
            type="button"
            onClick={() => setSignInOpen(true)}
            className="lt-tap border-border mt-2 flex w-full items-center justify-center gap-1.5 rounded-[13px] border py-2.5 text-[11px] font-bold"
          >
            <LogIn size={12} />{t.account.signIn}
          </button>
        </div>
      )}

      {!live && isPermanent && (
        <div className="mt-4 grid gap-1">
          <button
            type="button"
            onClick={() => void supabase.auth.signOut()}
            className="text-text-faint hover:text-text flex w-full items-center justify-center gap-1.5 py-2 text-[11px]"
          >
            <LogOut size={12} />{t.account.signOut}
          </button>
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="text-text-faint hover:text-like flex w-full items-center justify-center gap-1.5 py-2 text-[11px]"
          >
            <Trash2 size={12} />{t.account.delete}
          </button>
        </div>
      )}

      <SignInDialog
        open={signInOpen}
        locale={locale}
        onClose={() => setSignInOpen(false)}
        onSignedIn={() => { /* 反映は ControlWindow の onAuthStateChange が受ける */ }}
      />

      {error && !open && <p role="alert" className="text-like mt-2 text-center text-[11px]">{error}</p>}

      <dialog
        ref={dialogRef}
        aria-labelledby="account-delete-title"
        onCancel={(event) => { event.preventDefault(); close(); }}
        onClick={(event) => { if (event.target === dialogRef.current) close(); }}
        className="event-pass-dialog border-border bg-bg-elev text-text m-0 mt-auto max-h-[92dvh] w-full max-w-none overflow-y-auto rounded-t-sheet border border-b-0 p-0 shadow-float"
      >
        <div className="p-5 pb-[max(20px,env(safe-area-inset-bottom))]">
          <h2 id="account-delete-title" className="text-[18px] font-bold tracking-[-.025em]">{t.account.deleteTitle}</h2>
          <p className="text-text-muted mt-3 text-[12px] leading-6">{t.account.deleteBody}</p>
          <p className="text-text-faint mt-2 text-[11px] leading-5">{t.account.deleteKeeps}</p>

          <label htmlFor="account-delete-confirm" className="text-text-faint mt-5 block text-[11px] font-semibold">
            {t.account.deleteConfirmLabel}
          </label>
          <input
            id="account-delete-confirm"
            value={confirmation}
            autoComplete="off"
            onChange={(event) => setConfirmation(event.target.value)}
            className="border-border mt-1 w-full rounded-control border bg-transparent px-3 py-2.5 text-[13px] tracking-[0.2em] outline-none"
          />

          {error && <p role="alert" className="text-like mt-4 text-[11px] leading-5">{error}</p>}

          <div className="mt-5 grid gap-2">
            <button
              type="button"
              onClick={() => void confirmDelete()}
              disabled={busy || confirmation.trim().toUpperCase() !== t.account.deleteConfirmWord}
              className="lt-tap bg-like flex min-h-12 items-center justify-center gap-2 rounded-control px-4 text-[12px] font-bold text-white disabled:opacity-40"
            >
              {busy ? <Loader2 size={15} className="animate-spin motion-reduce:animate-none" /> : t.account.deleteSubmit}
            </button>
            <button
              type="button"
              onClick={close}
              disabled={busy}
              className="lt-tap border-border min-h-10 rounded-control border text-[11px] font-bold disabled:opacity-40"
            >
              {t.account.deleteCancel}
            </button>
          </div>
        </div>
      </dialog>
    </div>
  );
}
