/*
 * Motor de renderização ZPL -> Canvas.
 *
 * Interpreta os comandos ZPL II mais usados em etiquetas de envio
 * (Shopee, Mercado Livre, Correios, transportadoras) e desenha cada
 * etiqueta em um <canvas>. As medidas são em "dots" da impressora,
 * como no ZPL; a escala final é aplicada só na hora de desenhar.
 *
 * Dependências: bwip-js (códigos de barras), pako (gráficos Z64).
 */
import bwipjs from 'bwip-js';
import { inflate } from 'pako';

// ---------------------------------------------------------------------------
// Fontes
// ---------------------------------------------------------------------------

// Fonte 0 do ZPL (CG Triumvirate Bold Condensed) é aproximada com Roboto Condensed Bold.
const SCALABLE_FONT = '700 {size}px "ZPL Font 0", "Roboto Condensed", "Arial Narrow", sans-serif';
// Fontes bitmap (A..H) são monoespaçadas.
const BITMAP_FONT = '500 {size}px "ZPL Bitmap", "Roboto Mono", "DejaVu Sans Mono", monospace';

const F0_CAP = 0.73;      // altura da maiúscula / altura ZPL (medido no Labelary)
const F0_SIZE = 1.027;    // font-size CSS / altura ZPL  (0.73 / 0.711 de cap-height da Roboto)
const BM_SIZE = 1.07;     // font-size CSS / altura da célula bitmap
const BM_BASE = 0.77;     // linha de base / altura da célula bitmap

// Avanço de cada caractere da fonte 0, em milésimos da largura ZPL (medido no Labelary).
// A Roboto tem proporções diferentes (dígitos mais estreitos, hífen curto), então o
// glifo é desenhado centralizado nesse avanço para manter a diagramação original.
const F0_CHARS = ' !"#$%&\'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~';
const F0_VALUES = [
  296, 295, 479, 479, 479, 904, 608, 295, 295, 295, 479, 904, 295, 904, 295, 295, 479, 479, 479, 479,
  479, 479, 479, 479, 479, 479, 295, 295, 996, 904, 996, 442, 904, 553, 553, 534, 590, 498, 498, 590,
  608, 277, 442, 553, 479, 756, 608, 572, 553, 572, 590, 534, 498, 608, 534, 812, 553, 553, 498, 295,
  479, 295, 498, 498, 295, 461, 498, 442, 498, 479, 277, 498, 498, 259, 259, 442, 259, 756, 498, 479,
  498, 498, 332, 424, 277, 498, 442, 664, 442, 442, 387, 498, 498, 498, 996,
];
const F0_ADV = new Map([...F0_CHARS].map((c, i) => [c, F0_VALUES[i]]));
// Glifos trocados para ficar parecidos com a fonte da Zebra.
const F0_GLYPH = { '-': '\u2014' };
let f0GlyphScale = 0.93;  // recalculado em loadFonts() a partir da fonte carregada

function f0Advance(ch) {
  let v = F0_ADV.get(ch);
  if (v === undefined) v = F0_ADV.get(ch.normalize('NFD')[0]);
  return v;
}

// [altura, largura, espaço entre caracteres] em dots, a 8 dpmm.
const BITMAP_FONTS = {
  A: [9, 5, 1], B: [11, 7, 2], C: [18, 10, 2], D: [18, 10, 2],
  E: [28, 15, 5], F: [26, 13, 3], G: [60, 40, 8], H: [21, 13, 6], GS: [24, 24, 0],
};
// Fontes escaláveis com tamanho padrão.
const SCALABLE_DEFAULTS = {
  P: [20, 18], Q: [28, 24], R: [35, 31], S: [40, 35], T: [48, 42], U: [59, 53], V: [80, 71],
};

const CP850_HIGH =
  'ÇüéâäàåçêëèïîìÄÅÉæÆôöòûùÿÖÜø£Ø×ƒáíóúñÑªº¿®¬½¼¡«»░▒▓│┤ÁÂÀ©╣║╗╝¢¥┐└┴┬├─┼ãÃ╚╔╩╦╠═╬¤ðÐÊËÈıÍÎÏ┘┌█▄¦Ì▀ÓßÔÒõÕµþÞÚÛÙýÝ¯´­±‗¾¶§÷¸°¨·¹³²■ ';

// ---------------------------------------------------------------------------
// Code 128 (codificação própria para reproduzir a escolha de subsets da Zebra)
// ---------------------------------------------------------------------------

const C128 = [
  '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212', '221213',
  '221312', '231212', '112232', '122132', '122231', '113222', '123122', '123221', '223211', '221132',
  '221231', '213212', '223112', '312131', '311222', '321122', '321221', '312212', '322112', '322211',
  '212123', '212321', '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313',
  '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121', '313121', '211331',
  '231131', '213113', '213311', '213131', '311123', '311321', '331121', '312113', '312311', '332111',
  '314111', '221411', '431111', '111224', '111422', '121124', '121421', '141122', '141221', '112214',
  '112412', '122114', '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111',
  '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112', '421211', '212141',
  '214121', '412121', '111143', '111341', '131141', '114113', '114311', '411113', '411311', '113141',
  '114131', '311141', '411131', '211412', '211214', '211232', '2331112',
];
const C128_START = { A: 103, B: 104, C: 105 };
const C128_SWITCH = { A: 101, B: 100, C: 99 };

function c128Char(ch, set) {
  const code = ch.charCodeAt(0);
  if (set === 'A') {
    if (code < 32) return code + 64;
    if (code < 96) return code - 32;
    return null;
  }
  if (code >= 32 && code < 128) return code - 32;
  return null;
}

function digitRun(s, i) {
  let n = 0;
  while (i + n < s.length && s[i + n] >= '0' && s[i + n] <= '9') n++;
  return n;
}

// Modo N (padrão): respeita os códigos de invocação ">;" ">:" ">5" etc.
function encodeCode128Manual(data) {
  const codes = [];
  let text = '';
  let i = 0;
  let set = 'B';
  if (data[0] === '>' && ';:9'.includes(data[1])) {
    set = { ';': 'C', ':': 'B', '9': 'A' }[data[1]];
    i = 2;
  }
  codes.push(C128_START[set]);
  const switchTo = (s) => { if (set !== s) { codes.push(C128_SWITCH[s]); set = s; } };
  while (i < data.length) {
    const ch = data[i];
    if (ch === '>' && i + 1 < data.length) {
      const n = data[i + 1];
      let handled = true;
      switch (n) {
        case '5': switchTo('C'); break;
        case '6': switchTo('B'); break;
        case '7': switchTo('A'); break;
        case '8': codes.push(102); break; // FNC1
        case '2': codes.push(97); break;  // FNC3
        case '3': codes.push(96); break;  // FNC2
        case '4': codes.push(set === 'A' ? 101 : 100); break; // FNC4
        case '0':
          if (set === 'C') switchTo('B');
          codes.push(c128Char('>', set)); text += '>';
          break;
        default: handled = false;
      }
      if (handled) { i += 2; continue; }
    }
    if (set === 'C') {
      if (digitRun(data, i) >= 2) {
        codes.push(parseInt(data.substr(i, 2), 10));
        text += data.substr(i, 2);
        i += 2;
        continue;
      }
      switchTo('B');
    }
    let c = c128Char(ch, set);
    if (c === null) {
      switchTo(set === 'A' ? 'B' : 'A');
      c = c128Char(ch, set);
    }
    if (c !== null) { codes.push(c); text += ch; }
    i++;
  }
  return { codes, text };
}

// Modo A (automático) e D (UCC/EAN): escolhe subsets para menor largura.
function encodeCode128Auto(data, fnc1) {
  data = data.replace(/>8/g, 'ñ');
  const codes = [];
  let text = '';
  let i = 0;
  const first = digitRun(data, 0);
  let set = (first >= 4 || (first === data.length && first >= 2 && first % 2 === 0)) ? 'C' : 'B';
  codes.push(C128_START[set]);
  if (fnc1) codes.push(102);
  while (i < data.length) {
    const ch = data[i];
    if (ch === 'ñ') { codes.push(102); i++; continue; }
    const run = digitRun(data, i);
    if (set === 'C') {
      if (run >= 2) {
        codes.push(parseInt(data.substr(i, 2), 10));
        text += data.substr(i, 2);
        i += 2;
        continue;
      }
      codes.push(C128_SWITCH.B); set = 'B';
    } else if (run >= 6 || (run >= 4 && i + run === data.length)) {
      if (run % 2 === 1) { codes.push(c128Char(ch, set)); text += ch; i++; }
      codes.push(C128_SWITCH.C); set = 'C';
      continue;
    }
    let c = c128Char(ch, set);
    if (c === null) {
      const other = set === 'A' ? 'B' : 'A';
      codes.push(C128_SWITCH[other]); set = other;
      c = c128Char(ch, set);
    }
    if (c !== null) { codes.push(c); text += ch; }
    i++;
  }
  return { codes, text };
}

function code128Modules(codes) {
  let sum = codes[0];
  for (let k = 1; k < codes.length; k++) sum += codes[k] * k;
  const all = codes.concat([sum % 103, 106]);
  const out = [];
  for (const c of all) for (const d of C128[c]) out.push(+d);
  return out;
}

// ---------------------------------------------------------------------------
// Tokenização
// ---------------------------------------------------------------------------

const DRAWING_COMMANDS = new Set(['FD', 'FV', 'SN', 'GB', 'GC', 'GD', 'GE', 'GF', 'XG', 'IM']);

// Comandos cujo conteúdo pode conter "~" literal.
const DATA_COMMANDS = new Set(['FD', 'FV', 'FX', 'SN']);

function tokenize(src) {
  let caret = '^', tilde = '~', delim = ',';
  const out = [];
  const n = src.length;
  let i = 0;
  while (i < n) {
    const ch = src[i];
    if (ch !== caret && ch !== tilde) { i++; continue; }
    const prefix = ch === caret ? '^' : '~';
    let name, start;
    if (prefix === '^' && (src[i + 1] || '').toUpperCase() === 'A') {
      name = 'A'; start = i + 2;           // ^A tem o nome da fonte colado: ^A0N,30,30
    } else {
      name = src.substr(i + 1, 2).toUpperCase(); start = i + 3;
    }
    let j = start;
    if (DATA_COMMANDS.has(name)) {
      while (j < n && src[j] !== caret) j++;
    } else {
      while (j < n && src[j] !== caret && src[j] !== tilde) j++;
    }
    let raw = src.slice(start, j);
    raw = DATA_COMMANDS.has(name) ? raw.replace(/[\r\n]/g, '') : raw.replace(/[\r\n\t]/g, '');
    out.push({ p: prefix, c: name, raw, d: delim });
    if (name === 'CC') caret = raw[0] || caret;
    else if (name === 'CT') tilde = raw[0] || tilde;
    else if (name === 'CD') delim = raw[0] || delim;
    i = j;
  }
  return out;
}

function args(tok, limit) {
  const parts = tok.raw.split(tok.d);
  if (limit && parts.length > limit) {
    const head = parts.slice(0, limit - 1);
    head.push(parts.slice(limit - 1).join(tok.d));
    return head.map((s, k) => (k < limit - 1 ? s.trim() : s));
  }
  return parts.map((s) => s.trim());
}

function num(v, def) {
  if (v === undefined || v === null || v === '') return def;
  const x = parseFloat(v);
  return isNaN(x) ? def : x;
}

function graphicKey(name) {
  let k = (name || '').trim().toUpperCase().replace(/^[A-Z]:/, '');
  if (!k.includes('.')) k += '.GRF';
  return k;
}

/**
 * Separa o texto ZPL em etiquetas (^XA ... ^XZ).
 * Gráficos ~DG e formatos ^DF ficam guardados para uso nas etiquetas seguintes.
 * Cada etiqueta guarda os gráficos que existiam quando ela foi lida, porque arquivos
 * como os da Shopee reaproveitam o mesmo nome (R:DEMO.GRF) em todas as etiquetas.
 */
function parse(src) {
  const tokens = tokenize(src);
  const graphics = new Map();
  const formats = new Map();
  const labels = [];
  let cur = null;
  for (const t of tokens) {
    if (t.c === 'XA') { cur = []; continue; }
    if (t.c === 'XZ') {
      if (cur) finishLabel(cur);
      cur = null;
      continue;
    }
    if (t.p === '~' && t.c === 'DG') {
      const a = args(t, 4);
      const bpr = num(a[2], 0), total = num(a[1], 0);
      graphics.set(graphicKey(a[0]), { bytes: decodeGraphicData('A', total, bpr, a[3] || ''), bpr, total });
      continue;
    }
    if (cur) cur.push(t);
  }
  if (cur && cur.length) finishLabel(cur);

  function finishLabel(toks) {
    const df = toks.find((t) => t.c === 'DF');
    if (df) {
      formats.set(graphicKey(df.raw.replace(/\.[A-Z]+$/i, '') + '.ZPL'), toks.filter((t) => t !== df));
      return;
    }
    const xf = toks.findIndex((t) => t.c === 'XF');
    if (xf >= 0) {
      const fmt = formats.get(graphicKey(toks[xf].raw.replace(/\.[A-Z]+$/i, '') + '.ZPL'));
      if (fmt) toks = toks.slice(0, xf).concat(fmt, toks.slice(xf + 1));
    }
    // Blocos só de configuração (^XA^JUS^XZ etc.) não viram página.
    if (toks.some((t) => DRAWING_COMMANDS.has(t.c))) labels.push({ tokens: toks, graphics: new Map(graphics) });
    for (const t of toks) if (t.c === 'ID') graphics.delete(graphicKey(t.raw));
  }

  return { labels, graphics };
}

// ---------------------------------------------------------------------------
// Gráficos (^GF, ~DG)
// ---------------------------------------------------------------------------

function base64ToBytes(s) {
  const bin = atob(s.replace(/[^A-Za-z0-9+/=]/g, ''));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function hexVal(c) {
  const x = c.charCodeAt(0);
  if (x >= 48 && x <= 57) return x - 48;
  if (x >= 65 && x <= 70) return x - 55;
  if (x >= 97 && x <= 102) return x - 87;
  return -1;
}

// Hexadecimal com a compressão ASCII da Zebra (G..Y, g..z, ",", "!", ":").
function decodeCompressedHex(data, total, bpr) {
  const out = new Uint8Array(total);
  const rowHex = bpr * 2;
  let pos = 0;
  let line = '';
  let prev = '0'.repeat(rowHex);
  let repeat = 0;
  const flush = () => {
    const row = line.slice(0, rowHex);
    for (let k = 0; k < bpr && pos < total; k++) {
      const hi = hexVal(row[k * 2] || '0'), lo = hexVal(row[k * 2 + 1] || '0');
      out[pos++] = (hi << 4) | lo;
    }
    prev = row;
    line = line.slice(rowHex);
  };
  for (let i = 0; i < data.length && pos < total; i++) {
    const c = data[i];
    const code = c.charCodeAt(0);
    if (code >= 71 && code <= 89) { repeat += code - 70; continue; }          // G..Y = 1..19
    if (code >= 103 && code <= 122) { repeat += (code - 102) * 20; continue; } // g..z = 20..400
    if (hexVal(c) >= 0) {
      line += c.repeat(repeat || 1);
      repeat = 0;
      while (line.length >= rowHex && pos < total) flush();
      continue;
    }
    if (c === ',') { line = line.padEnd(rowHex, '0'); flush(); }
    else if (c === '!') { line = line.padEnd(rowHex, 'F'); flush(); }
    else if (c === ':') { line = prev; flush(); }
    repeat = 0;
  }
  return out;
}

function decodeGraphicData(fmt, total, bpr, data) {
  if (!total || !bpr) return new Uint8Array(0);
  if (fmt === 'B' || fmt === 'C') {
    const out = new Uint8Array(total);
    for (let i = 0; i < total && i < data.length; i++) out[i] = data.charCodeAt(i) & 0xff;
    return out;
  }
  data = data.replace(/\s+/g, '');
  const m = data.match(/^:(Z64|B64):([^:]*)/i);
  if (m) {
    let bytes = base64ToBytes(m[2]);
    if (m[1].toUpperCase() === 'Z64') bytes = inflate(bytes);
    if (bytes.length >= total) return bytes.subarray(0, total);
    const out = new Uint8Array(total);
    out.set(bytes);
    return out;
  }
  return decodeCompressedHex(data, total, bpr);
}

// Última coluna/linha com pixel preto (+1), para não contar margem branca da imagem.
function bitmapExtent(img) {
  if (!img.extent) {
    let w = 0, h = 0;
    for (let i = 0; i < img.bytes.length; i++) {
      const b = img.bytes[i];
      if (!b) continue;
      let bit = 7;
      while (!(b & (1 << (7 - bit)))) bit--;
      w = Math.max(w, (i % img.bpr) * 8 + bit + 1);
      h = Math.floor(i / img.bpr) + 1;
    }
    img.extent = [w, h];
  }
  return img.extent;
}

// Até onde as imagens (^XG, ^GF, ^IM) vão, para a etiqueta não cortar nenhuma delas.
function imagesExtent(tokens, graphics) {
  let lhX = 0, lhY = 0, x = 0, y = 0, maxX = 0, maxY = 0;
  const grow = (img, mx, my) => {
    const [w, h] = bitmapExtent(img);
    if (!w) return;
    maxX = Math.max(maxX, x + w * mx);
    maxY = Math.max(maxY, y + h * my);
  };
  for (const t of tokens) {
    if (t.c === 'LH') { const a = args(t); lhX = num(a[0], 0); lhY = num(a[1], 0); }
    else if (t.c === 'FO') { const a = args(t); x = lhX + num(a[0], 0); y = lhY + num(a[1], 0); }
    else if (t.c === 'XG' || t.c === 'IM') {
      const a = args(t);
      const img = graphics.get(graphicKey(a[0]));
      if (img) grow(img, t.c === 'XG' ? num(a[1], 1) : 1, t.c === 'XG' ? num(a[2], 1) : 1);
    } else if (t.c === 'GF') {
      const a = args(t, 5);
      const bpr = num(a[3], 0), total = num(a[1], 0);
      if (bpr) { maxX = Math.max(maxX, x + bpr * 8); maxY = Math.max(maxY, y + Math.ceil(total / bpr)); }
    }
  }
  return [maxX, maxY];
}

function bitmapCanvas(bytes, bpr, color) {
  const w = bpr * 8, h = Math.ceil(bytes.length / bpr);
  const cv = document.createElement('canvas');
  cv.width = Math.max(1, w); cv.height = Math.max(1, h);
  const ctx = cv.getContext('2d');
  const img = ctx.createImageData(cv.width, cv.height);
  const v = color === '#fff' ? 255 : 0;
  const d = img.data;
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i];
    if (!b) continue;
    const base = i * 8;
    for (let bit = 0; bit < 8; bit++) {
      if (b & (0x80 >> bit)) {
        const p = (base + bit) * 4;
        d[p] = d[p + 1] = d[p + 2] = v;
        d[p + 3] = 255;
      }
    }
  }
  ctx.putImageData(img, 0, 0);
  return cv;
}

// ---------------------------------------------------------------------------
// Texto
// ---------------------------------------------------------------------------

function decodeFieldData(data, hexChar, ci) {
  if (!hexChar) return data;
  const bytes = [];
  const enc = new TextEncoder();
  for (let i = 0; i < data.length; i++) {
    const c = data[i];
    if (c === hexChar && i + 2 < data.length + 1 && /^[0-9a-fA-F]{2}$/.test(data.substr(i + 1, 2))) {
      bytes.push(parseInt(data.substr(i + 1, 2), 16));
      i += 2;
    } else if (ci === 28) {
      for (const b of enc.encode(c)) bytes.push(b);
    } else {
      const code = c.charCodeAt(0);
      bytes.push(code < 256 ? code : 63);
    }
  }
  const u8 = new Uint8Array(bytes);
  if (ci === 28 || ci === 29 || ci === 30) return new TextDecoder('utf-8').decode(u8);
  if (ci === 27) return new TextDecoder('windows-1252').decode(u8);
  let s = '';
  for (const b of u8) s += b < 128 ? String.fromCharCode(b) : CP850_HIGH[b - 128];
  return s;
}

function resolveFont(st, f) {
  const src = f.font || { name: st.cf.name, o: st.fw, h: st.cf.h, w: st.cf.w };
  const name = (src.name || '0').toUpperCase();
  const o = (src.o || st.fw || 'N').toUpperCase();
  if (BITMAP_FONTS[name]) {
    const [bh, bw, gap] = BITMAP_FONTS[name];
    const mh = src.h ? Math.max(1, Math.round(src.h / bh)) : 1;
    const mw = src.w ? Math.max(1, Math.round(src.w / bw)) : mh;
    return { bitmap: true, o, h: bh * mh, w: bw * mw, gap: gap * mw };
  }
  let h = src.h, w = src.w;
  if (!h && !w) {
    const def = SCALABLE_DEFAULTS[name];
    if (def) { h = def[0]; w = def[1]; } else { h = st.cf.h; w = st.cf.w; }
  }
  h = h || w; w = w || h;
  return { bitmap: false, o, h, w };
}

function makeTextTools(ctx, fm) {
  if (fm.bitmap) {
    const size = fm.h * BM_SIZE;
    const font = BITMAP_FONT.replace('{size}', size.toFixed(2));
    const sx = fm.w / (0.6 * size);
    const adv = fm.w + fm.gap;
    return {
      width: (s) => Math.max(0, [...s].length * adv - fm.gap),
      baseline: fm.h * BM_BASE,
      anchorY: fm.h * BM_BASE,
      draw(c, s, x, y) {
        c.font = font;
        c.textBaseline = 'alphabetic';
        let k = 0;
        for (const ch of s) {
          c.save();
          c.translate(x + k * adv + fm.w / 2, y);
          c.scale(sx, 1);
          c.textAlign = 'center';
          c.fillText(ch, 0, 0);
          c.restore();
          k++;
        }
      },
    };
  }
  const size = fm.h * F0_SIZE;
  const font = SCALABLE_FONT.replace('{size}', size.toFixed(2));
  const sx = (fm.w / fm.h) * f0GlyphScale;
  const unit = fm.w / 1000;
  const advance = (ch) => {
    const v = f0Advance(ch);
    if (v !== undefined) return v * unit;
    ctx.font = font;
    return ctx.measureText(ch).width * sx;
  };
  return {
    width(s) { let w = 0; for (const ch of s) w += advance(ch); return w; },
    baseline: fm.h * F0_CAP,
    anchorY: fm.h * F0_CAP,
    draw(c, s, x, y) {
      c.font = font;
      c.textBaseline = 'alphabetic';
      c.textAlign = 'left';
      for (const ch of s) {
        const adv = advance(ch);
        if (ch !== ' ') {
          const glyph = F0_GLYPH[ch] || ch;
          const gw = c.measureText(glyph).width * sx;
          const k = gw > adv * 0.98 && gw > 0 ? (adv * 0.98) / gw : 1;
          c.save();
          c.translate(x + (adv - gw * k) / 2, y);
          c.scale(sx * k, 1);
          c.fillText(glyph, 0, 0);
          c.restore();
        }
        x += adv;
      }
    },
  };
}

function wrapLines(text, maxW, measure) {
  const lines = [];
  for (const para of text.split('\\&')) {
    if (!isFinite(maxW) || maxW <= 0) { lines.push(para); continue; }
    const words = para.split(' ');
    let line = '';
    for (let word of words) {
      const test = line ? line + ' ' + word : word;
      if (measure(test) <= maxW || !line && measure(word) <= maxW) { line = test; continue; }
      if (line) lines.push(line);
      // palavra maior que a largura: quebra por caractere
      while (measure(word) > maxW && word.length > 1) {
        let k = word.length - 1;
        while (k > 1 && measure(word.slice(0, k)) > maxW) k--;
        lines.push(word.slice(0, k));
        word = word.slice(k);
      }
      line = word;
    }
    lines.push(line);
  }
  return lines;
}

// ---------------------------------------------------------------------------
// Renderização de uma etiqueta
// ---------------------------------------------------------------------------

const ANGLE = { N: 0, R: Math.PI / 2, I: Math.PI, B: Math.PI * 1.5 };

/**
 * Posiciona e desenha um campo. "draw" recebe o contexto já transformado:
 * o campo ocupa o retângulo (0,0)-(W,H) e "anchor" é o ponto usado pelo ^FT.
 */
function place(ctx, f, W, H, anchor, o, reverse, draw) {
  ctx.save();
  const color = reverse ? '#fff' : '#000';
  if (reverse) ctx.globalCompositeOperation = 'difference';
  ctx.fillStyle = color;
  const x = f.x, y = f.y;
  const ang = ANGLE[o] || 0;
  if (f.type === 'FT') {
    ctx.translate(x, y);
    ctx.rotate(ang);
    ctx.translate(-anchor[0], -anchor[1]);
  } else {
    if (o === 'R') ctx.translate(x + H, y);
    else if (o === 'I') ctx.translate(x + W, y + H);
    else if (o === 'B') ctx.translate(x, y + W);
    else ctx.translate(x, y);
    ctx.rotate(ang);
  }
  draw(ctx, color);
  ctx.restore();
}

function drawText(ctx, st, f, text) {
  const fm = resolveFont(st, f);
  const tt = makeTextTools(ctx, fm);
  const reverse = f.fr || st.lr;
  if (!f.fb) {
    const W = tt.width(text);
    place(ctx, f, W, fm.h, [0, tt.anchorY], fm.o, reverse, (c) => tt.draw(c, text, 0, tt.baseline));
    if (f.type === 'FT' && fm.o === 'N') { st.nextX = f.x + W; st.nextY = f.y; }
    return;
  }
  const fb = f.fb;
  const lineH = fm.h + fb.sp;
  const maxLines = Math.max(1, fb.tbH ? Math.floor((fb.tbH + fb.sp) / lineH) : fb.lines);
  const blockW = fb.w > 0 ? fb.w : Infinity;
  const lines = wrapLines(text, blockW, tt.width);
  const W = isFinite(blockW) ? blockW : Math.max(...lines.map(tt.width));
  const H = maxLines * lineH - fb.sp;
  const anchor = [0, (maxLines - 1) * lineH + tt.anchorY];
  place(ctx, f, W, H, anchor, fm.o, reverse, (c) => {
    lines.forEach((line, i) => {
      const y = Math.min(i, maxLines - 1) * lineH + tt.baseline;
      const lw = tt.width(line);
      const isLast = i === lines.length - 1;
      if (fb.j === 'J' && !isLast && isFinite(W) && line.includes(' ')) {
        const words = line.split(' ');
        const gap = (W - tt.width(words.join(''))) / (words.length - 1);
        let x = 0;
        for (const w of words) { tt.draw(c, w, x, y); x += tt.width(w) + gap; }
        return;
      }
      // A Zebra mede a linha com um espaço no final ao centralizar/alinhar à direita.
      const trail = fb.j === 'C' || fb.j === 'R' ? tt.width(' ') : 0;
      let x = 0;
      if (fb.j === 'C') x = (W - lw - trail) / 2;
      else if (fb.j === 'R') x = W - lw - trail;
      tt.draw(c, line, x, y);
    });
  });
}

// ---------------------------------------------------------------------------
// Códigos de barras
// ---------------------------------------------------------------------------

const INTERP_FONT = { name: 'A' };

function drawLinear(ctx, st, f, o, modules, h, opts) {
  const mw = st.by.w;
  const ratio = opts.ratio ? st.by.r : 0;
  const widths = modules.map((m) => (ratio && m > 1 ? Math.round(mw * ratio) : m * mw));
  const W = widths.reduce((a, b) => a + b, 0);
  const reverse = f.fr || st.lr;
  place(ctx, f, W, h, [0, h], o, reverse, (c) => {
    let x = 0;
    widths.forEach((w, i) => {
      if (i % 2 === 0) c.fillRect(x, 0, w, h);
      x += w;
    });
    if (opts.text) {
      const fm = resolveFont(st, { font: { name: INTERP_FONT.name, h: 9 * mw, w: 5 * mw } });
      const tt = makeTextTools(c, fm);
      const tw = tt.width(opts.text);
      const gap = 3 * mw;
      const ty = opts.above ? -gap - fm.h : h + gap;
      tt.draw(c, opts.text, (W - tw) / 2, ty + tt.baseline);
    }
  });
}

function drawMatrix(ctx, st, f, o, sym, mx, my, foOffset, ftAnchorExtra) {
  const W = sym.w * mx, Hs = sym.h * my;
  const H = Hs + (foOffset || 0);
  const reverse = f.fr || st.lr;
  const top = f.type === 'FT' ? 0 : (foOffset || 0);
  place(ctx, f, W, H, [0, Hs + (ftAnchorExtra || 0)], o, reverse, (c) => {
    for (let r = 0; r < sym.h; r++) {
      let run = -1;
      for (let col = 0; col <= sym.w; col++) {
        const on = col < sym.w && sym.pixs[r * sym.w + col];
        if (on && run < 0) run = col;
        if (!on && run >= 0) {
          c.fillRect(run * mx, top + r * my, (col - run) * mx, my);
          run = -1;
        }
      }
    }
  });
}

function bwipRaw(bcid, text, opts) {
  return bwipjs.raw(Object.assign({ bcid, text }, opts || {}))[0];
}

function drawBarcode(ctx, st, f, data, warn) {
  const t = f.bc.type;
  const a = f.bc.a;
  const o = (a[0] || st.fw || 'N').toUpperCase();
  const yes = (v, def) => (v ? v.toUpperCase() === 'Y' : def);
  try {
    switch (t) {
      case 'BC': {
        const h = num(a[1], st.by.h);
        const mode = (a[5] || 'N').toUpperCase();
        const enc = mode === 'N' || mode === 'U' ? encodeCode128Manual(data) : encodeCode128Auto(data, mode === 'D');
        drawLinear(ctx, st, f, o, code128Modules(enc.codes), h, {
          text: yes(a[2], true) ? enc.text : null, above: yes(a[3], false),
        });
        break;
      }
      case 'B3': { // Code 39
        const h = num(a[2], st.by.h);
        const r = bwipRaw('code39', data, { includecheck: yes(a[1], false) });
        drawLinear(ctx, st, f, o, r.sbs, h, {
          ratio: true, text: yes(a[3], true) ? '*' + data + '*' : null, above: yes(a[4], false),
        });
        break;
      }
      case 'BA': { // Code 93
        const h = num(a[1], st.by.h);
        const r = bwipRaw('code93', data, { includecheck: yes(a[4], false) });
        drawLinear(ctx, st, f, o, r.sbs, h, { text: yes(a[2], true) ? data : null, above: yes(a[3], false) });
        break;
      }
      case 'B2': { // Interleaved 2 of 5
        const h = num(a[1], st.by.h);
        const r = bwipRaw('interleaved2of5', data, { includecheck: yes(a[4], false) });
        drawLinear(ctx, st, f, o, r.sbs, h, {
          ratio: true, text: yes(a[2], true) ? data : null, above: yes(a[3], false),
        });
        break;
      }
      case 'BK': { // Codabar
        const h = num(a[2], st.by.h);
        const s = (a[5] || 'A') + data + (a[6] || 'A');
        const r = bwipRaw('rationalizedCodabar', s, {});
        drawLinear(ctx, st, f, o, r.sbs, h, {
          ratio: true, text: yes(a[3], true) ? s : null, above: yes(a[4], false),
        });
        break;
      }
      case 'BE': case 'BU': case 'B8': { // EAN-13, UPC-A, EAN-8
        const bcid = { BE: 'ean13', BU: 'upca', B8: 'ean8' }[t];
        const len = { BE: 12, BU: 11, B8: 7 }[t];
        const digits = data.replace(/\D/g, '').slice(0, len);
        const h = num(a[1], st.by.h);
        const r = bwipRaw(bcid, digits, {});
        drawLinear(ctx, st, f, o, r.sbs, h, { text: yes(a[2], true) ? digits : null, above: yes(a[3], false) });
        break;
      }
      case 'BQ': { // QR Code
        const mag = num(a[2], 2);
        let ecc = (a[3] || 'Q').toUpperCase();
        let d = data;
        const m = d.match(/^([HQML])([AM]),/i);
        if (m) {
          ecc = m[1].toUpperCase();
          d = d.slice(3);
          if (m[2].toUpperCase() === 'M') {
            if (/^B\d{4}/i.test(d)) d = d.slice(5);
            else if (/^[NAK]/i.test(d)) d = d.slice(1);
          }
        } else if (/^[AM],/i.test(d)) {
          d = d.slice(2);
        }
        const r = bwipRaw('qrcode', d, { eclevel: ecc });
        // Particularidade da Zebra: com ^FO o QR desce a altura do ^BY; com ^FT sobe 3 módulos.
        drawMatrix(ctx, st, f, 'N', { pixs: r.pixs, w: r.pixx, h: r.pixy }, mag, mag, st.by.h, 3 * mag);
        break;
      }
      case 'BX': { // Data Matrix
        const mod = num(a[1], 4);
        const opts = {};
        const cols = num(a[3], 0), rows = num(a[4], 0);
        if (cols) opts.columns = cols;
        if (rows) opts.rows = rows;
        const r = bwipRaw('datamatrix', data, opts);
        drawMatrix(ctx, st, f, o, { pixs: r.pixs, w: r.pixx, h: r.pixy }, mod, mod);
        break;
      }
      case 'B7': { // PDF417
        const rowH = num(a[1], st.by.h);
        const opts = { rowmult: 1 };
        const sec = num(a[2], 0), cols = num(a[3], 0), rows = num(a[4], 0);
        if (sec) opts.eclevel = sec;
        if (cols) opts.columns = cols;
        if (rows) opts.rows = rows;
        const r = bwipRaw(yes(a[5], false) ? 'pdf417compact' : 'pdf417', data, opts);
        drawMatrix(ctx, st, f, o, { pixs: r.pixs, w: r.pixx, h: r.pixy }, st.by.w, rowH);
        break;
      }
      case 'BO': case 'B0': { // Aztec
        const mag = num(a[1], 4);
        const r = bwipRaw('azteccode', data, {});
        drawMatrix(ctx, st, f, o, { pixs: r.pixs, w: r.pixx, h: r.pixy }, mag, mag);
        break;
      }
      default:
        warn('^' + t);
    }
  } catch (e) {
    warn('^' + t + ' (' + (e.message || e).toString().slice(0, 80) + ')');
  }
}

// ---------------------------------------------------------------------------
// Formas (^GB, ^GC, ^GE, ^GD) e imagens (^GF, ^XG, ^IM)
// ---------------------------------------------------------------------------

function drawShape(ctx, st, f, tok) {
  const a = args(tok);
  const reverse = f.fr || st.lr;
  const fill = (c, color, col) => { c.fillStyle = col === 'W' && !reverse ? '#fff' : color; };
  switch (tok.c) {
    case 'GB': {
      const t = Math.max(1, num(a[2], 1));
      const w = Math.max(num(a[0], t), t), h = Math.max(num(a[1], t), t);
      const col = (a[3] || 'B').toUpperCase();
      const R = (Math.min(Math.max(num(a[4], 0), 0), 8) / 8) * (Math.min(w, h) / 2);
      place(ctx, f, w, h, [0, h], 'N', reverse, (c, color) => {
        fill(c, color, col);
        c.beginPath();
        if (R > 0 && c.roundRect) c.roundRect(0, 0, w, h, R); else c.rect(0, 0, w, h);
        if (w - 2 * t > 0 && h - 2 * t > 0) {
          const Ri = Math.max(0, R - t);
          if (Ri > 0 && c.roundRect) c.roundRect(t, t, w - 2 * t, h - 2 * t, Ri); else c.rect(t, t, w - 2 * t, h - 2 * t);
        }
        c.fill('evenodd');
      });
      break;
    }
    case 'GC': {
      const d = num(a[0], 3), t = Math.max(1, num(a[1], 1));
      const col = (a[2] || 'B').toUpperCase();
      place(ctx, f, d, d, [0, d], 'N', reverse, (c, color) => {
        fill(c, color, col);
        c.beginPath();
        c.arc(d / 2, d / 2, d / 2, 0, Math.PI * 2);
        if (d / 2 - t > 0) c.arc(d / 2, d / 2, d / 2 - t, 0, Math.PI * 2);
        c.fill('evenodd');
      });
      break;
    }
    case 'GE': {
      const t = Math.max(1, num(a[2], 1));
      const w = Math.max(num(a[0], t), t), h = Math.max(num(a[1], t), t);
      const col = (a[3] || 'B').toUpperCase();
      place(ctx, f, w, h, [0, h], 'N', reverse, (c, color) => {
        fill(c, color, col);
        c.beginPath();
        c.ellipse(w / 2, h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
        if (w / 2 - t > 0 && h / 2 - t > 0) c.ellipse(w / 2, h / 2, w / 2 - t, h / 2 - t, 0, 0, Math.PI * 2);
        c.fill('evenodd');
      });
      break;
    }
    case 'GD': {
      const t = Math.max(1, num(a[2], 1));
      const w = Math.max(num(a[0], t), t), h = Math.max(num(a[1], t), t);
      const col = (a[3] || 'B').toUpperCase();
      const left = ['L', '\\'].includes((a[4] || 'R').toUpperCase());
      place(ctx, f, w, h, [0, h], 'N', reverse, (c, color) => {
        fill(c, color, col);
        c.beginPath();
        if (left) { c.moveTo(0, 0); c.lineTo(t, 0); c.lineTo(w, h); c.lineTo(w - t, h); }
        else { c.moveTo(0, h); c.lineTo(t, h); c.lineTo(w, 0); c.lineTo(w - t, 0); }
        c.closePath();
        c.fill();
      });
      break;
    }
  }
}

function drawBitmap(ctx, st, f, img, mx, my) {
  if (!img || !img.bytes.length) return;
  const reverse = f.fr || st.lr;
  const cv = bitmapCanvas(img.bytes, img.bpr, reverse ? '#fff' : '#000');
  const W = cv.width * mx, H = cv.height * my;
  place(ctx, f, W, H, [0, H], 'N', reverse, (c) => {
    c.imageSmoothingEnabled = false;
    c.drawImage(cv, 0, 0, W, H);
  });
}

// ---------------------------------------------------------------------------
// Interpretador
// ---------------------------------------------------------------------------

const IGNORED = new Set([
  'FX', 'MM', 'MN', 'MT', 'MD', 'PR', 'JM', 'JU', 'JZ', 'JA', 'MF', 'MU', 'MC', 'ML', 'MP',
  'SD', 'SR', 'SS', 'ST', 'SZ', 'SP', 'PF', 'PH', 'PP', 'JB', 'JT', 'JS', 'JJ', 'KD', 'KL', 'KN', 'KP',
  'CC', 'CT', 'CD', 'CM', 'CO', 'CW', 'FL', 'FP', 'FM', 'FC', 'FE', 'HH', 'HZ', 'HW', 'HV', 'ID', 'IL',
  'IS', 'JW', 'NC', 'NI', 'NT', 'PS', 'SC', 'SE', 'SF', 'SL', 'SO', 'SQ', 'SX', 'TO', 'WD', 'XB',
  'XF', 'DF', 'DY', 'EG', 'MW', 'NS', 'PA', 'FA',
]);

function newField() {
  return { x: 0, y: 0, type: null, font: null, fb: null, fr: false, fh: null, bc: null, data: null, fn: null };
}

function renderTokens(ctx, tokens, graphics, warn) {
  const st = {
    lhX: 0, lhY: 0, lt: 0, ls: 0, nextX: 0, nextY: 0,
    fw: 'N', cf: { name: 'A', h: 9, w: 5 }, by: { w: 2, r: 3, h: 10 },
    ci: 0, lr: false, po: 'N', pq: 1, pw: 0, ll: 0,
    fnValues: {},
  };
  // ^FNn^FD...^FS sem posição = valor para um campo de formato (^XF)
  {
    let fn = null, hasPos = false;
    for (const t of tokens) {
      if (t.c === 'FO' || t.c === 'FT') hasPos = true;
      else if (t.c === 'FN') fn = parseInt(t.raw, 10);
      else if ((t.c === 'FD' || t.c === 'FV') && fn !== null && !hasPos) st.fnValues[fn] = t.raw;
      else if (t.c === 'FS') { fn = null; hasPos = false; }
    }
  }
  let f = newField();
  for (const tok of tokens) {
    const c = tok.c;
    switch (c) {
      case 'FO': case 'FT': {
        const a = args(tok);
        const hasX = a[0] !== undefined && a[0] !== '';
        const hasY = a[1] !== undefined && a[1] !== '';
        if (c === 'FT' && !hasX && !hasY) { f.x = st.nextX; f.y = st.nextY; }
        else {
          f.x = st.lhX + num(a[0], 0) - st.ls;
          f.y = st.lhY + num(a[1], 0) + st.lt;
        }
        f.type = c;
        break;
      }
      case 'A': {
        const name = tok.raw[0] || '0';
        const a = tok.raw.slice(1).split(tok.d);
        f.font = { name, o: (a[0] || '').trim() || null, h: num(a[1], null), w: num(a[2], null) };
        if (name === '@') f.font.name = '0';
        break;
      }
      case 'CF': {
        const a = args(tok);
        if (a[0]) st.cf.name = a[0];
        const h = num(a[1], null), w = num(a[2], null);
        if (h) { st.cf.h = h; st.cf.w = w || null; }
        else if (w) st.cf.w = w;
        if (!st.cf.w && BITMAP_FONTS[st.cf.name.toUpperCase()] === undefined) st.cf.w = st.cf.h;
        break;
      }
      case 'FW': if (tok.raw[0]) st.fw = tok.raw[0].toUpperCase(); break;
      case 'FB': {
        const a = args(tok);
        f.fb = { w: num(a[0], 0), lines: num(a[1], 1), sp: num(a[2], 0), j: (a[3] || 'L').toUpperCase() };
        break;
      }
      case 'TB': {
        const a = args(tok);
        f.fb = { w: num(a[1], 0), lines: 0, sp: 0, j: 'L', tbH: num(a[2], 0) };
        break;
      }
      case 'FR': f.fr = true; break;
      case 'FH': f.fh = tok.raw[0] || '_'; break;
      case 'FN': f.fn = parseInt(tok.raw, 10); break;
      case 'FD': case 'FV': f.data = (f.data || '') + tok.raw; break;
      case 'SN': f.data = args(tok)[0]; break;
      case 'BY': {
        const a = args(tok);
        st.by.w = num(a[0], st.by.w);
        st.by.r = num(a[1], st.by.r);
        st.by.h = num(a[2], st.by.h);
        break;
      }
      case 'BC': case 'B3': case 'BA': case 'B2': case 'BK': case 'BE': case 'BU': case 'B8':
      case 'BQ': case 'BX': case 'B7': case 'BO': case 'B0':
      case 'B1': case 'B4': case 'B5': case 'B9': case 'BB': case 'BD': case 'BF': case 'BI': case 'BJ':
      case 'BL': case 'BM': case 'BP': case 'BR': case 'BS': case 'BT': case 'BZ':
        f.bc = { type: c, a: args(tok) };
        break;
      case 'GB': case 'GC': case 'GE': case 'GD':
        drawShape(ctx, st, f, tok);
        break;
      case 'GF': {
        const a = args(tok, 5);
        const fmt = (a[0] || 'A').toUpperCase();
        const total = num(a[1], 0), bpr = num(a[3], 0);
        drawBitmap(ctx, st, f, { bytes: decodeGraphicData(fmt, total, bpr, a[4] || ''), bpr }, 1, 1);
        break;
      }
      case 'XG': {
        const a = args(tok);
        const img = graphics.get(graphicKey(a[0]));
        if (img) drawBitmap(ctx, st, f, img, num(a[1], 1), num(a[2], 1));
        else warn('^XG ' + a[0] + ' (gráfico não encontrado)');
        break;
      }
      case 'IM': {
        const img = graphics.get(graphicKey(tok.raw));
        if (img) drawBitmap(ctx, st, f, img, 1, 1);
        break;
      }
      case 'FS': {
        let data = f.data;
        if (f.fn !== null && f.fn !== undefined && !isNaN(f.fn)) {
          if (!f.type) { f = newField(); break; } // apenas atribuição de valor
          if (st.fnValues[f.fn] !== undefined) data = st.fnValues[f.fn];
        }
        if (data !== null && data !== undefined) {
          data = decodeFieldData(data, f.fh, st.ci);
          if (f.bc) drawBarcode(ctx, st, f, data, warn);
          else drawText(ctx, st, f, data);
        }
        f = newField();
        break;
      }
      case 'LH': {
        const a = args(tok);
        st.lhX = num(a[0], 0); st.lhY = num(a[1], 0);
        break;
      }
      case 'LT': st.lt = num(tok.raw, 0); break;
      case 'LS': st.ls = num(tok.raw, 0); break;
      case 'LR': st.lr = (tok.raw[0] || '').toUpperCase() === 'Y'; break;
      case 'PO': st.po = (tok.raw[0] || 'N').toUpperCase(); break;
      case 'CI': st.ci = num(args(tok)[0], 0); break;
      case 'PQ': st.pq = Math.max(1, num(args(tok)[0], 1)); break;
      case 'PW': st.pw = num(tok.raw, 0); break;
      case 'LL': st.ll = num(tok.raw, 0); break;
      default:
        if (!IGNORED.has(c)) warn(tok.p + c);
    }
  }
  return st;
}

/**
 * Desenha uma etiqueta.
 * opts: { widthDots, heightDots, scale (pixels por dot), mono (preto e branco puro) }
 * O tamanho vem do ^PW/^LL quando existe; senão de widthDots/heightDots. Se alguma
 * imagem passar desse tamanho, a etiqueta cresce para não cortá-la.
 */
function render(label, graphics, opts) {
  graphics = label.graphics || graphics;
  const scale = opts.scale || 1;
  const warnings = new Set();
  const warn = (w) => warnings.add(w);

  const pre = renderTokens(measureCtx(), label.tokens.filter((t) => t.c === 'PW' || t.c === 'LL' || t.c === 'PQ' || t.c === 'PO'), graphics, () => {});
  const [imgW, imgH] = imagesExtent(label.tokens, graphics);
  const wDots = Math.max(pre.pw || opts.widthDots, imgW);
  const hDots = Math.max(pre.ll || opts.heightDots, imgH);

  const cv = document.createElement('canvas');
  cv.width = Math.round(wDots * scale);
  cv.height = Math.round(hDots * scale);
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, cv.width, cv.height);
  ctx.scale(scale, scale);
  const st = renderTokens(ctx, label.tokens, graphics, warn);

  let out = cv;
  if (st.po === 'I') {
    out = document.createElement('canvas');
    out.width = cv.width; out.height = cv.height;
    const c2 = out.getContext('2d');
    c2.translate(cv.width, cv.height);
    c2.rotate(Math.PI);
    c2.drawImage(cv, 0, 0);
  }
  if (opts.mono) threshold(out);
  return { canvas: out, copies: st.pq, warnings: [...warnings], widthDots: wDots, heightDots: hDots };
}

let _mctx = null;
function measureCtx() {
  if (!_mctx) _mctx = document.createElement('canvas').getContext('2d');
  return _mctx;
}

function threshold(cv) {
  const ctx = cv.getContext('2d');
  const img = ctx.getImageData(0, 0, cv.width, cv.height);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const v = (d[i] * 299 + d[i + 1] * 587 + d[i + 2] * 114) / 1000 < 128 ? 0 : 255;
    d[i] = d[i + 1] = d[i + 2] = v;
    d[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
}

let fontsReady = null;
function loadFonts() {
  if (!fontsReady) {
    fontsReady = (document.fonts ? Promise.all([
      document.fonts.load('700 20px "ZPL Font 0"'),
      document.fonts.load('500 20px "ZPL Bitmap"'),
    ]).catch(() => {}) : Promise.resolve()).then(() => {
      // Escala horizontal dos glifos para que a largura média das letras bata com a tabela.
      const ctx = measureCtx();
      ctx.font = SCALABLE_FONT.replace('{size}', (1000 * F0_SIZE).toFixed(0));
      let table = 0, real = 0;
      for (const ch of 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789') {
        table += F0_ADV.get(ch);
        real += ctx.measureText(ch).width;
      }
      if (real > 0) f0GlyphScale = table / real;
    });
  }
  return fontsReady;
}

export const ZPL = { parse, render, loadFonts, tokenize, threshold, _code128: { encodeCode128Manual, encodeCode128Auto, code128Modules } };
