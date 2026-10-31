import { useRef } from 'react';
import { Icon } from './Icons.jsx';
import { PAPER_SIZES } from '../engine/labels.js';

export function StartScreen({ onFiles, onPaste, onSample }) {
  const input = useRef(null);
  return (
    <section className="start">
      <div className="drop" onClick={() => input.current.click()}>
        <input
          ref={input}
          type="file"
          multiple
          hidden
          accept=".txt,.zpl,.prn,.zip,text/plain,application/zip"
          onChange={(e) => { if (e.target.files.length) onFiles([...e.target.files]); e.target.value = ''; }}
        />
        <span className="drop-icon"><Icon name="upload" /></span>
        <h1>Converta etiquetas ZPL em PDF</h1>
        <p>Arraste aqui o arquivo da Shopee ou do Mercado Livre</p>
        <button
          type="button"
          className="btn primary"
          onClick={(e) => { e.stopPropagation(); input.current.click(); }}
        >
          Escolher arquivo
        </button>
        <small>.zip, .txt ou .zpl</small>
      </div>
      <div className="alt">
        <button type="button" className="link" onClick={onPaste}>Colar código ZPL</button>
        <span aria-hidden="true">·</span>
        <button type="button" className="link" onClick={onSample}>Ver exemplo</button>
      </div>
      <p className="note">Tudo acontece no seu computador. Nenhum arquivo é enviado.</p>
    </section>
  );
}

function fmtMm(v) { return (Math.round(v * 10) / 10).toString().replace('.', ','); }

export function Toolbar({ name, pages, rendering, busy, settings, set, thermal, onPrint, onPdf, onClose }) {
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
        <button
          type="button"
          className={'btn' + (thermal ? ' primary' : '')}
          disabled={disabled}
          onClick={onPrint}
          title={thermal ? 'Enviar direto para a ' + thermal.name : 'Abrir o diálogo de impressão'}
        >
          <Icon name="printer" />
          {busy === 'print' ? 'Enviando…' : 'Imprimir'}
        </button>
        <button type="button" className={'btn' + (thermal ? '' : ' primary')} disabled={disabled} onClick={onPdf}>
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
