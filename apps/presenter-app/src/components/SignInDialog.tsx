import { useEffect, useRef } from "react";

import type { Locale } from "@layertalk/shared";

import { PresenterAuth } from "./PresenterAuth";

type Props = {
  open: boolean;
  locale: Locale;
  onClose: () => void;
  onSignedIn: () => void;
};

/**
 * サインインをシートで出す。
 *
 * **起動時の壁には戻さないこと**（App Store 5.1.1(v)）。匿名セッションで一通り使えるのが本線で、
 * ここを開くのは「購入」「発表レポート」「退会」だけ ——
 * どれも `requirePresenter` がサーバ側で匿名を弾く操作。
 *
 * `AccountFooter` と `EventPassPanel` の2箇所から開くので、状態は各自が持つ。
 * 共有の store を置くほどのものではない。
 */
export function SignInDialog({ open, locale, onClose, onSignedIn }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    else if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      onCancel={(event) => { event.preventDefault(); onClose(); }}
      onClick={(event) => { if (event.target === dialogRef.current) onClose(); }}
      className="event-pass-dialog border-border bg-bg-elev text-text m-0 mt-auto max-h-[92dvh] w-full max-w-none overflow-y-auto rounded-t-sheet border border-b-0 p-0 shadow-float"
    >
      <div className="pb-[max(4px,env(safe-area-inset-bottom))]">
        <PresenterAuth
          locale={locale}
          onSignedIn={() => { onSignedIn(); onClose(); }}
        />
      </div>
    </dialog>
  );
}
