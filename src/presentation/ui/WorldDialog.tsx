import { useEffect, useId, useRef, type ReactNode } from 'react';

export function WorldDialog({
  title,
  eyebrow = 'ODKRYWAJ ARCHIPELAG',
  onClose,
  children,
  onBack,
  id: dialogId,
  className,
}: {
  title: string;
  id?: string;
  className?: string;
  eyebrow?: string;
  onClose: () => void;
  children: ReactNode;
  onBack?: (() => void) | undefined;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  const id = useId();
  useEffect(() => {
    const dialog = ref.current!;
    const returnFocus = document.activeElement;
    dialog.showModal();
    return () => {
      dialog.close();
      if (returnFocus instanceof HTMLElement && returnFocus.isConnected)
        returnFocus.focus({ preventScroll: true });
    };
  }, []);
  useEffect(() => {
    ref.current?.querySelector('.pr-dialog-body')?.scrollTo(0, 0);
    ref.current
      ?.querySelector<HTMLButtonElement>('.pr-dialog-header button')
      ?.focus({ preventScroll: true });
  }, [title]);
  return (
    <dialog
      id={dialogId}
      className={'pr-dialog' + (className ? ' ' + className : '')}
      ref={ref}
      aria-labelledby={id}
      onCancel={(e) => {
        e.preventDefault();
        close.current();
      }}
      onClick={(e) => {
        if (e.target === ref.current) {
          const r = ref.current.getBoundingClientRect();
          if (
            e.clientX < r.left ||
            e.clientX > r.right ||
            e.clientY < r.top ||
            e.clientY > r.bottom
          )
            close.current();
        }
      }}
    >
      <header className="pr-dialog-header">
        <div>
          <span className="pr-eyebrow">{eyebrow}</span>
          <h2 id={id}>{title}</h2>
        </div>
        <button onClick={onClose} aria-label="Zamknij szczegóły">
          ×
        </button>
      </header>
      <div className="pr-dialog-body">{children}</div>
      <footer className="pr-dialog-footer">
        {onBack && <button onClick={onBack}>← Wróć do listy</button>}
        <button onClick={onClose}>Wróć na wyspy</button>
      </footer>
    </dialog>
  );
}
