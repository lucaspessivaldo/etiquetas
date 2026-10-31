/* Gera as páginas finais (já no tamanho do papel) a partir do texto ZPL. */
import { ZPL } from './zpl.js';

// Pixels por dot na imagem final (2 = ~406 dpi para ZPL de 203 dpi).
const RENDER_SCALE = 2;
const MAX_COPIES = 50;

export const PAPER_SIZES = [
  { value: '100x150', label: 'Papel 100 × 150 mm' },
  { value: 'auto', label: 'Papel automático' },
  { value: '101.6x152.4', label: 'Papel 4 × 6 pol' },
  { value: '100x100', label: 'Papel 100 × 100 mm' },
  { value: '101.6x101.6', label: 'Papel 4 × 4 pol' },
  { value: '100x50', label: 'Papel 100 × 50 mm' },
  { value: '60x40', label: 'Papel 60 × 40 mm' },
  { value: '50x30', label: 'Papel 50 × 30 mm' },
  { value: 'custom', label: 'Personalizado…' },
];

// Tamanho do papel em mm, ou null no modo automático (página = tamanho da etiqueta).
function paperSizeMm(s) {
  if (s.size === 'auto') return null;
  if (s.size === 'custom') return [parseFloat(s.w) || 100, parseFloat(s.h) || 150];
  return s.size.split('x').map(parseFloat);
}

function rotateCanvas(cv, deg) {
  if (!deg) return cv;
  const out = document.createElement('canvas');
  const swap = deg === 90 || deg === 270;
  out.width = swap ? cv.height : cv.width;
  out.height = swap ? cv.width : cv.height;
  const ctx = out.getContext('2d');
  ctx.translate(out.width / 2, out.height / 2);
  ctx.rotate((deg * Math.PI) / 180);
  ctx.drawImage(cv, -cv.width / 2, -cv.height / 2);
  return out;
}

// Coloca a etiqueta no papel: se for maior, reduz até caber (sem cortar), centralizada.
function fitToPaper(cv, pxPerMm, wmm, hmm, mono) {
  const pw = Math.round(wmm * pxPerMm), ph = Math.round(hmm * pxPerMm);
  if (Math.abs(cv.width - pw) <= 2 && Math.abs(cv.height - ph) <= 2) return cv;
  const k = Math.min(1, pw / cv.width, ph / cv.height);
  const out = document.createElement('canvas');
  out.width = pw; out.height = ph;
  const ctx = out.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, pw, ph);
  const w = cv.width * k, h = cv.height * k;
  ctx.drawImage(cv, (pw - w) / 2, (ph - h) / 2, w, h);
  // A redução cria tons de cinza nas bordas; volta para preto e branco puro.
  if (mono && k < 1) ZPL.threshold(out);
  return out;
}

/**
 * Renderiza todas as etiquetas. "cancelled()" permite abandonar o trabalho
 * quando o usuário troca de arquivo no meio.
 * Retorna { pages: [{ canvas, url, wmm, hmm, index, copy, copies }], warnings } ou null se cancelado.
 */
export async function renderPages(text, settings, cancelled) {
  await ZPL.loadFonts();
  if (cancelled()) return null;

  const dpmm = parseFloat(settings.dpmm);
  const paper = paperSizeMm(settings);
  // Sem ^PW/^LL, a etiqueta usa o tamanho do papel (ou 4 × 6 pol no automático).
  const [baseW, baseH] = paper || [101.6, 152.4];
  const rotate = parseInt(settings.rotate, 10);
  const { labels, graphics } = ZPL.parse(text);
  const pages = [];
  const warnings = new Set();

  for (let i = 0; i < labels.length; i++) {
    let r;
    try {
      r = ZPL.render(labels[i], graphics, {
        widthDots: Math.round(baseW * dpmm),
        heightDots: Math.round(baseH * dpmm),
        scale: RENDER_SCALE,
        mono: settings.mono,
      });
    } catch (e) {
      console.error(e);
      warnings.add('Erro na etiqueta ' + (i + 1) + ': ' + e.message);
      continue;
    }
    r.warnings.forEach((w) => warnings.add(w));
    let canvas = rotateCanvas(r.canvas, rotate);
    let w, h;
    if (paper) {
      [w, h] = paper;
      canvas = fitToPaper(canvas, dpmm * RENDER_SCALE, w, h, settings.mono);
    } else {
      w = r.widthDots / dpmm; h = r.heightDots / dpmm;
      if (rotate === 90 || rotate === 270) [w, h] = [h, w];
    }
    const url = canvas.toDataURL('image/png');
    const copies = settings.copies ? Math.min(r.copies, MAX_COPIES) : 1;
    for (let c = 0; c < copies; c++) pages.push({ canvas, url, wmm: w, hmm: h, index: i + 1, copy: c + 1, copies });

    // Mantém a tela responsiva em arquivos com muitas etiquetas.
    if (i % 5 === 4) {
      await new Promise((res) => setTimeout(res));
      if (cancelled()) return null;
    }
  }
  return { pages, warnings: [...warnings], labelCount: labels.length };
}
