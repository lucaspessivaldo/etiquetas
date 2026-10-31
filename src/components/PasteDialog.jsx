import { useState } from 'react';
import { Dialog } from './Dialog.jsx';
import { Icon } from './Icons.jsx';

export function PasteDialog({ open, onClose, onSubmit }) {
  const [text, setText] = useState('');
  return (
    <Dialog open={open} onClose={onClose} className="modal">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (text.trim()) onSubmit(text);
          setText('');
          onClose();
        }}
      >
        <header>
          <h2>Colar código ZPL</h2>
          <button type="button" className="btn quiet icon" aria-label="Fechar" onClick={onClose}><Icon name="close" /></button>
        </header>
        <textarea
          autoFocus
          spellCheck={false}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={'^XA\n^FO50,50^A0N,40,40^FDOlá mundo^FS\n^XZ'}
        />
        <footer>
          <button type="button" className="btn" onClick={onClose}>Cancelar</button>
          <button type="submit" className="btn primary" disabled={!text.trim()}>Converter</button>
        </footer>
      </form>
    </Dialog>
  );
}
