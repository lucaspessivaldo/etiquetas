import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Icon } from './components/Icons.jsx';
import { StartScreen, Toolbar, Preview } from './components/Screens.jsx';
import { SettingsDrawer } from './components/SettingsDrawer.jsx';
import { renderPages } from './engine/labels.js';
import { readFiles, buildPdf, pdfFileName, printWithDialog } from './engine/output.js';
import { SAMPLE } from './engine/sample.js';

const SETTINGS_KEY = 'zpl2pdf-settings';
const DEFAULTS = { size: '100x150', w: '100', h: '150', dpmm: '8', rotate: '0', mono: true, copies: true };

function useSettings() {
  const [settings, setSettings] = useState(() => {
    try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') }; } catch (e) { return DEFAULTS; }
  });
  const set = useCallback((key, value) => {
    setSettings((s) => {
      const next = { ...s, [key]: value };
      try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(next)); } catch (e) { /* ignora */ }
      return next;
    });
  }, []);
  return [settings, set];
}

function useToast() {
  const [toast, setToast] = useState(null);
  const timer = useRef(0);
  const show = useCallback((text, error = false) => {
    clearTimeout(timer.current);
    setToast({ text, error });
    timer.current = setTimeout(() => setToast(null), error ? 7000 : 3500);
  }, []);
  return [toast, show];
}

function cleanError(e) {
  return String((e && e.message) || e);
}

export default function App() {
  const [settings, set] = useSettings();
  const [toast, showToast] = useToast();
  const [doc, setDoc] = useState({ text: '', name: '' });
  const [result, setResult] = useState({ pages: [], warnings: [] });
  const [rendering, setRendering] = useState(false);
  const [busy, setBusy] = useState(null); // 'pdf'
  const [panel, setPanel] = useState(null); // 'settings'
  const [draft, setDraft] = useState(''); // código colado na tela inicial; fica ao voltar
  const [dragging, setDragging] = useState(false);

  const { pages, warnings } = result;

  // Re-renderiza quando o arquivo ou alguma configuração de página muda.
  // useLayoutEffect: marca "Gerando…" antes da tela ser pintada; com useEffect, ao abrir
  // um arquivo piscava "Nenhuma etiqueta encontrada" por um quadro.
  const { size, w, h, dpmm, rotate, mono, copies } = settings;
  useLayoutEffect(() => {
    if (!doc.text.trim()) { setResult({ pages: [], warnings: [] }); setRendering(false); return undefined; }
    let cancelled = false;
    setRendering(true);
    const t = setTimeout(() => {
      renderPages(doc.text, { size, w, h, dpmm, rotate, mono, copies }, () => cancelled)
        .then((r) => { if (r && !cancelled) { setResult(r); setRendering(false); } })
        .catch((e) => { if (!cancelled) { setRendering(false); showToast('Erro ao gerar: ' + cleanError(e), true); } });
    }, 120);
    return () => { cancelled = true; clearTimeout(t); };
  }, [doc.text, size, w, h, dpmm, rotate, mono, copies, showToast]);

  const openFiles = useCallback(async (files) => {
    try {
      const r = await readFiles(files);
      if (r) setDoc(r);
      else showToast('Nenhum código ZPL encontrado no arquivo.', true);
    } catch (e) {
      showToast('Não consegui abrir o arquivo: ' + cleanError(e), true);
    }
  }, [showToast]);

  // Arrastar e soltar em qualquer lugar da janela.
  useEffect(() => {
    let depth = 0;
    const enter = (e) => { e.preventDefault(); depth++; setDragging(true); };
    const over = (e) => e.preventDefault();
    const leave = (e) => { e.preventDefault(); if (--depth <= 0) { depth = 0; setDragging(false); } };
    const drop = (e) => {
      e.preventDefault(); depth = 0; setDragging(false);
      if (e.dataTransfer && e.dataTransfer.files.length) openFiles([...e.dataTransfer.files]);
    };
    document.addEventListener('dragenter', enter);
    document.addEventListener('dragover', over);
    document.addEventListener('dragleave', leave);
    document.addEventListener('drop', drop);
    return () => {
      document.removeEventListener('dragenter', enter);
      document.removeEventListener('dragover', over);
      document.removeEventListener('dragleave', leave);
      document.removeEventListener('drop', drop);
    };
  }, [openFiles]);
  useEffect(() => { document.body.classList.toggle('dragging', dragging); }, [dragging]);

  async function downloadPdf() {
    setBusy('pdf');
    try {
      await new Promise((r) => setTimeout(r, 30));
      buildPdf(pages).save(pdfFileName());
    } catch (e) {
      showToast('Erro ao gerar o PDF: ' + cleanError(e), true);
    } finally {
      setBusy(null);
    }
  }

  const hasDoc = !!doc.text.trim();

  return (
    <>
      <header className="bar">
        <div className="logo">
          <span className="mark"><Icon name="printer" /></span>
          Etiquetas ZPL
        </div>
        <button type="button" className="btn quiet" onClick={() => setPanel('settings')}>
          <Icon name="settings" />
          <span>Configurações</span>
        </button>
      </header>

      <main>
        {!hasDoc ? (
          <StartScreen
            onFiles={openFiles}
            draft={draft}
            onDraft={setDraft}
            onConvert={() => setDoc({ text: draft, name: 'Código colado' })}
            onSample={() => setDoc({ text: SAMPLE, name: 'Etiqueta de exemplo' })}
          />
        ) : (
          <section className="result">
            <Toolbar
              name={doc.name}
              pages={pages}
              rendering={rendering}
              busy={busy}
              settings={settings}
              set={set}
              onPrint={() => printWithDialog(pages)}
              onPdf={downloadPdf}
              onClose={() => setDoc({ text: '', name: '' })}
            />
            <Preview pages={pages} warnings={warnings} rendering={rendering} />
          </section>
        )}
      </main>

      <SettingsDrawer
        open={panel === 'settings'}
        onClose={() => setPanel(null)}
        settings={settings}
        set={set}
      />

      {toast && <div className={'toast' + (toast.error ? ' error' : '')} role="status">{toast.text}</div>}

      <div className="drop-overlay" aria-hidden="true">
        <div><Icon name="upload" />Solte o arquivo para abrir</div>
      </div>
    </>
  );
}
