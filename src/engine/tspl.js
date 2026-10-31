/*
 * Converte as páginas já renderizadas em comandos TSPL (impressoras de etiqueta
 * genéricas: Knup KP-IM604, Xprinter, Elgin L42...). Cada página vira um BITMAP
 * em preto e branco na resolução da impressora.
 */

const DPI = 203;
const LIMIAR = 160; // abaixo disso o pixel imprime (preto)

function ascii(s) {
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

// Bits da linha: na TSPL 0 imprime (preto) e 1 fica branco.
function bitmap(canvas, wmm, hmm) {
  const w = Math.round((wmm / 25.4) * DPI);
  const h = Math.round((hmm / 25.4) * DPI);
  const wbytes = Math.ceil(w / 8);
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, w, h);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(canvas, 0, 0, w, h);
  const px = ctx.getImageData(0, 0, w, h).data;
  const bits = new Uint8Array(wbytes * h).fill(0xff);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (px[i] * 0.299 + px[i + 1] * 0.587 + px[i + 2] * 0.114 < LIMIAR) {
        bits[y * wbytes + (x >> 3)] &= ~(0x80 >> (x & 7));
      }
    }
  }
  return { wbytes, h, bits };
}

/**
 * pages: [{ canvas, wmm, hmm }]
 * opts: { density (0-15), speed (1-6), gap (mm), direction (0/1) }
 * Retorna os bytes prontos para mandar à impressora.
 */
export function buildTspl(pages, opts) {
  const o = { density: 8, speed: 4, gap: 2, direction: 1, ...opts };
  const parts = [];
  let size = '';
  for (const p of pages) {
    const s = 'SIZE ' + p.wmm + ' mm,' + p.hmm + ' mm\r\n';
    if (s !== size) {
      size = s;
      parts.push(ascii(s + 'GAP ' + o.gap + ' mm,0 mm\r\nDIRECTION ' + o.direction +
        '\r\nDENSITY ' + o.density + '\r\nSPEED ' + o.speed + '\r\n'));
    }
    const b = bitmap(p.canvas, p.wmm, p.hmm);
    parts.push(ascii('CLS\r\nBITMAP 0,0,' + b.wbytes + ',' + b.h + ',0,'));
    parts.push(b.bits);
    parts.push(ascii('\r\nPRINT 1,1\r\n'));
  }
  const total = parts.reduce((n, a) => n + a.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const a of parts) { out.set(a, off); off += a.length; }
  return out;
}

// Faz a impressora medir sozinha o tamanho da etiqueta e o espaço entre elas.
export const CALIBRATE = ascii('GAPDETECT\r\n');
