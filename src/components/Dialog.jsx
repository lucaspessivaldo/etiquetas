import { useEffect, useRef } from 'react';

/** <dialog> modal controlado pelo React. Esc e clique fora chamam onClose. */
export function Dialog({ open, onClose, className, children }) {
  const ref = useRef(null);

  useEffect(() => {
    const d = ref.current;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className={className}
      onCancel={(e) => { e.preventDefault(); onClose(); }}
      onClick={(e) => { if (e.target === ref.current) onClose(); }}
    >
      {open && children}
    </dialog>
  );
}
