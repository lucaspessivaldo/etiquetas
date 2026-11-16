import { useRef } from 'react';
import { Icon } from './Icons.jsx';
import { PAPER_SIZES } from '../engine/labels.js';

// Exemplo que aparece bem claro ao fundo da caixa vazia, atrás do aviso (dados fictícios).
const CODE_EXAMPLE = [
  '^XA',
  '^CI28',
  '^FO50,40^A0N,36,36^FDDestinatário^FS',
  '^FO50,90^A0N,28,28^FDRua Exemplo, 123^FS',
  '^FO50,150^BY3^BCN,100,Y,N,N^FD123456789^FS',
  '^FO50,300^GB700,3,3^FS',
  '^XZ',
].join('\n');

// Tela inicial: uma caixa só, com o botão de abrir arquivo em cima e o código colado embaixo.
// Arrastar o arquivo para qualquer lugar da janela também abre (App.jsx).
export function StartScreen({ onFiles, draft, onDraft, onConvert, onSample }) {
  const input = useRef(null);
  const ready = !!draft.trim();
  return (
    <section className="start">
      <h1>Etiquetas ZPL em PDF</h1>
      <form className="paste" onSubmit={(e) => { e.preventDefault(); if (ready) onConvert(); }}>
        <input
          ref={input}
          type="file"
          multiple
          hidden
          accept=".txt,.zpl,.prn,.zip,text/plain,application/zip"
          onChange={(e) => { if (e.target.files.length) onFiles([...e.target.files]); e.target.value = ''; }}
        />
        <div className="open-row">
          <button type="button" className="btn ink" onClick={() => input.current.click()}>
            <Icon name="upload" />
            Abrir arquivo
          </button>
          <span className="open-hint">.zip, .txt ou .zpl, ou arraste o arquivo para a janela</span>
        </div>
        <div className="paste-or" aria-hidden="true">ou</div>
        <div className="code-box">
          <textarea
            id="zpl-code"
            aria-label="Código ZPL"
            spellCheck={false}
            placeholder={CODE_EXAMPLE}
            value={draft}
            onChange={(e) => onDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && ready) { e.preventDefault(); onConvert(); }
            }}
          />
          {/* Só o exemplo cinza parecia conteúdo apagado: o aviso no meio diz o que fazer */}
          {!draft && (
            <div className="code-hint" aria-hidden="true">
              <div>
                <Icon name="clipboard" />
                <strong>Cole aqui o código ZPL</strong>
                <span>Clique na caixa e aperte Ctrl + V</span>
              </div>
            </div>
          )}
        </div>
        <div className="paste-foot">
          <button type="submit" className="btn primary" disabled={!ready}>
            Converter <Icon name="arrow" />
          </button>
        </div>
      </form>
      <p className="note">
        <button type="button" className="link" onClick={onSample}>Ver um exemplo</button>
      </p>
    </section>
  );
}

function fmtMm(v) { return (Math.round(v * 10) / 10).toString().replace('.', ','); }

export function Toolbar({ name, pages, rendering, busy, settings, set, onPrint, onPdf, onClose }) {
  const n = pages.length;
  const status = rendering
    ? 'Gerando…'
    : n ? n + (n === 1 ? ' página' : ' páginas') + ' · ' + fmtMm(pages[0].wmm) + ' × ' + fmtMm(pages[0].hmm) + ' mm'
      : 'Nenhuma etiqueta';
  const disabled = !n || rendering || !!busy;
  return (
    <div className="toolbar">
      <div className="doc">
        <strong>{name}</strong>
        <span className="status">{status}</span>
      </div>
      <div className="controls">
        <select
          aria-label="Tamanho do papel"
          title="Tamanho do papel"
          value={settings.size}
          onChange={(e) => set('size', e.target.value)}
        >
          {PAPER_SIZES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
        </select>
        {settings.size === 'custom' && (
          <span className="custom-size">
            <input type="number" min="10" max="300" step="0.1" aria-label="Largura em mm"
              value={settings.w} onChange={(e) => set('w', e.target.value)} />
            ×
            <input type="number" min="10" max="600" step="0.1" aria-label="Altura em mm"
              value={settings.h} onChange={(e) => set('h', e.target.value)} />
            mm
          </span>
        )}
        <button type="button" className="btn" disabled={disabled} onClick={onPrint} title="Abrir o diálogo de impressão">
          <Icon name="printer" />
          Imprimir
        </button>
        <button type="button" className="btn primary" disabled={disabled} onClick={onPdf}>
          <Icon name="download" />
          {busy === 'pdf' ? 'Gerando PDF…' : 'Baixar PDF'}
        </button>
        <button type="button" id="clear" className="btn quiet icon" title="Abrir outro arquivo"
          aria-label="Fechar e abrir outro arquivo" onClick={onClose}>
          <Icon name="close" />
        </button>
      </div>
    </div>
  );
}

export function Preview({ pages, warnings, rendering }) {
  return (
    <>
      {warnings.length > 0 && (
        <div className="warnings">
          <strong>Alguns comandos foram ignorados: </strong>
          {warnings.slice(0, 12).map((w, k) => <span key={w}>{k ? ', ' : ''}<code>{w}</code></span>)}
          {warnings.length > 12 && ' …'}
        </div>
      )}
      <div className="preview">
        {!pages.length && !rendering && (
          <div className="empty">Nenhuma etiqueta encontrada. O código precisa ter blocos ^XA … ^XZ.</div>
        )}
        {pages.map((p, i) => (
          <figure className="label-card" key={i}>
            <img src={p.url} alt={'Etiqueta ' + p.index} />
            <figcaption>
              Etiqueta {p.index}{p.copies > 1 ? ' · cópia ' + p.copy + '/' + p.copies : ''}
            </figcaption>
          </figure>
        ))}
      </div>
    </>
  );
}
