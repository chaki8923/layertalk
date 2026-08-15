import { Loader2, Mail, RotateCcw, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";

import type { Locale } from "@layertalk/shared";

import { supabase } from "../lib/supabase";

const RESEND_COOLDOWN_MS = 60_000;

function isRateLimitError(error: { status?: number; message?: string }) {
  return error.status === 429 || /rate limit|security purposes|after \d+ seconds/i.test(error.message ?? "");
}

export function PresenterAuth({ locale, onSignedIn }: { locale: Locale; onSignedIn: () => void }) {
  const [email, setEmail] = useState("");
  const [token, setToken] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [resendAvailableAt, setResendAvailableAt] = useState<number | null>(null);
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const ja = locale === "ja";

  useEffect(() => {
    if (!resendAvailableAt) { setRemainingSeconds(0); return; }
    const initialSeconds = Math.max(0, Math.ceil((resendAvailableAt - Date.now()) / 1000));
    setRemainingSeconds(initialSeconds);
    if (initialSeconds === 0) return;

    const timer = window.setInterval(() => {
      const nextSeconds = Math.max(0, Math.ceil((resendAvailableAt - Date.now()) / 1000));
      setRemainingSeconds(nextSeconds);
      if (nextSeconds === 0) window.clearInterval(timer);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [resendAvailableAt]);

  const requestCode = async (resend = false) => {
    const normalizedEmail = email.trim().toLowerCase();
    setBusy(true); setError(null); setNotice(null);
    const { error: authError } = await supabase.auth.signInWithOtp({
      email: normalizedEmail,
      options: { shouldCreateUser: true },
    });
    setBusy(false);
    if (authError) {
      if (isRateLimitError(authError)) {
        // A prior request may already have delivered a usable code, so keep the
        // verification form available while Supabase enforces its send interval.
        setSent(true);
        setResendAvailableAt(Date.now() + RESEND_COOLDOWN_MS);
        setError(ja ? "送信回数の上限に達しました。少し待ってから再送してください。" : "Too many requests. Wait a moment before resending.");
      } else {
        setError(ja ? "確認コードを送信できませんでした。通信状態を確認してください。" : "Could not send the code. Check your connection and try again.");
      }
      return;
    }
    setEmail(normalizedEmail);
    setToken("");
    setSent(true);
    setResendAvailableAt(Date.now() + RESEND_COOLDOWN_MS);
    setNotice(resend
      ? (ja ? "新しい確認コードを送信しました。" : "A new verification code was sent.")
      : (ja ? "確認コードを送信しました。" : "Verification code sent."));
  };

  const verify = async () => {
    setBusy(true); setError(null);
    const { error: authError } = await supabase.auth.verifyOtp({ email: email.trim(), token: token.trim(), type: "email" });
    setBusy(false);
    if (authError) setError(ja ? "確認コードが無効か、期限が切れています。再送してお試しください。" : "The code is invalid or expired. Request a new one and try again.");
    else onSignedIn();
  };

  const changeEmail = () => {
    setSent(false);
    setToken("");
    setError(null);
    setNotice(null);
    setResendAvailableAt(null);
  };

  return (
    <div className="flex min-h-full items-center justify-center p-5">
      <div className="border-border bg-bg-elev w-full rounded-[24px] border p-5">
        <div className="bg-brand/12 text-brand flex h-10 w-10 items-center justify-center rounded-[14px]">
          <ShieldCheck size={20} />
        </div>
        <h1 className="mt-4 text-[20px] font-bold tracking-[-0.02em]">{ja ? "発表者としてログイン" : "Presenter sign in"}</h1>
        <p className="text-text-muted mt-2 text-[12px] leading-relaxed">
          {ja ? "ルームと購入内容を安全に管理するため、メールへ6桁のコードを送ります。" : "We’ll email a six-digit code to protect your rooms and purchases."}
        </p>
        <label className="text-text-faint mt-5 block text-[11px] font-semibold">EMAIL</label>
        <div className="border-border mt-1 flex items-center gap-2 rounded-[14px] border px-3">
          <Mail size={14} className="text-text-faint" />
          <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} disabled={sent}
            className="min-w-0 flex-1 bg-transparent py-3 text-[13px] outline-none" />
        </div>
        {sent && (
          <>
            <div className="bg-surface-strong mt-4 rounded-[12px] px-3 py-2.5">
              <p className="text-text-faint text-[10px] font-semibold">{ja ? "送信先" : "SENT TO"}</p>
              <p className="mt-0.5 truncate text-[12px] font-medium">{email}</p>
            </div>
            <label className="text-text-faint mt-4 block text-[11px] font-semibold">6-DIGIT CODE</label>
            <input inputMode="numeric" autoComplete="one-time-code" autoFocus value={token}
              onChange={(event) => setToken(event.target.value.replace(/\D/g, "").slice(0, 6))}
              onKeyDown={(event) => { if (event.key === "Enter" && token.length === 6 && !busy) void verify(); }}
              className="border-border lt-num mt-1 w-full rounded-[14px] border bg-transparent px-3 py-3 text-center text-[20px] tracking-[0.3em] outline-none" />
            <div className="mt-3 flex items-center justify-between gap-3">
              <button type="button" disabled={busy || remainingSeconds > 0} onClick={() => void requestCode(true)}
                className="text-brand disabled:text-text-faint flex items-center gap-1.5 text-[11px] font-semibold disabled:cursor-not-allowed">
                <RotateCcw size={12} />
                {remainingSeconds > 0
                  ? (ja ? `再送まで 0:${String(remainingSeconds).padStart(2, "0")}` : `Resend in 0:${String(remainingSeconds).padStart(2, "0")}`)
                  : (ja ? "コードを再送" : "Resend code")}
              </button>
              <button type="button" disabled={busy} onClick={changeEmail} className="text-text-muted text-[11px] font-semibold disabled:opacity-40">
                {ja ? "メールアドレスを変更" : "Change email"}
              </button>
            </div>
          </>
        )}
        {notice && <p role="status" className="text-online mt-3 text-[12px]">{notice}</p>}
        {error && <p className="text-like mt-3 text-[12px]">{error}</p>}
        <button type="button" disabled={busy || !email.includes("@") || (sent && token.length !== 6)}
          onClick={() => void (sent ? verify() : requestCode())}
          className="lt-tap mt-4 flex w-full items-center justify-center rounded-[14px] bg-[linear-gradient(135deg,#6b8aff,#b47cff)] px-4 py-3 text-[14px] font-bold text-white disabled:opacity-40">
          {busy ? <Loader2 size={16} className="animate-spin" /> : sent ? (ja ? "ログイン" : "Sign in") : (ja ? "確認コードを送る" : "Send code")}
        </button>
      </div>
    </div>
  );
}
