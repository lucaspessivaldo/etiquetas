/* Leitura de arquivos, geração do PDF e impressão pelo diálogo do sistema. */
import JSZip from 'jszip';
import { deflate } from 'pako';

function decodeText(buf) {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf);
  } catch (e) {
    return new TextDecoder('windows-1252').decode(buf);
  }
}

/** Lê .txt/.zpl/.zip e devolve { text, name }, ou null se não houver ZPL. */
export async function readFiles(files) {
  const parts = [];
  for (const f of files) {
    const buf = new Uint8Array(await f.arrayBuffer());
    const isZip = buf[0] === 0x50 && buf[1] === 0x4b;
    if (isZip) {
      const zip = await JSZip.loadAsync(buf);
      const names = Object.keys(zip.files).filter((n) => !zip.files[n].dir).sort();
      for (const n of names) {
        const text = decodeText(await zip.files[n].async('uint8array'));
        if (/\^XA/i.test(text)) parts.push(text);
      }
    } else {
      parts.push(decodeText(buf));
    }
  }
  if (!parts.length) return null;
  return { text: parts.join('\n'), name: files.length === 1 ? files[0].name : files.length + ' arquivos' };
}

export function pdfFileName() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return 'etiquetas-' + d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + '-' + pad(d.getHours()) + pad(d.getMinutes()) + '.pdf';
}

const pt = (mm) => +((mm * 72) / 25.4).toFixed(3);

/**
 * Monta o PDF à mão: uma página por etiqueta, cada uma com uma única imagem (1 bit por
 * pixel no preto e branco) comprimida com zlib. O jsPDF convertia cada canvas em PNG,
 * decodificava e comprimia de novo no thread da tela (~0,4 s por página): com 50
 * etiquetas a aba travava. Aqui cada página leva poucos ms e a tela é liberada a cada
 * poucas páginas. onProgress(feitas, total) atualiza o botão.
 */
export async function buildPdf(pages, onProgress = () => {}) {
  const enc = new TextEncoder();
  const parts = [];
  const offsets = [];
  let size = 0;
  let next = 3; // 1 = catálogo, 2 = árvore de páginas
  const write = (data) => {
    const bytes = typeof data === 'string' ? enc.encode(data) : data;
    parts.push(bytes);
    size += bytes.length;
  };
  const object = (n, dict, stream) => {
    offsets[n] = size;
    if (!stream) { write(n + ' 0 obj\n' + dict + '\nendobj\n'); return; }
    write(n + ' 0 obj\n<<' + dict + ' /Length ' + stream.length + '>>\nstream\n');
    write(stream);
    write('\nendstream\nendobj\n');
  };

  write('%PDF-1.4\n');
  write(new Uint8Array([0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a])); // marca o arquivo como binário
  const images = new Map(); // cópias da mesma etiqueta usam a mesma imagem
  const kids = [];
  for (let i = 0; i < pages.length; i++) {
    const p = pages[i], b = p.bitmap;
    let img = images.get(b);
    if (!img) {
      img = next++;
      object(img, ' /Type /XObject /Subtype /Image /Width ' + b.w + ' /Height ' + b.h +
        ' /ColorSpace /DeviceGray /BitsPerComponent ' + b.bpc + ' /Filter /FlateDecode', deflate(b.data));
      images.set(b, img);
    }
    const w = pt(p.wmm), h = pt(p.hmm);
    const content = next++;
    object(content, '', enc.encode('q ' + w + ' 0 0 ' + h + ' 0 0 cm /Im0 Do Q'));
    const page = next++;
    object(page, '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + w + ' ' + h + ']' +
      ' /Resources << /XObject << /Im0 ' + img + ' 0 R >> >> /Contents ' + content + ' 0 R >>');
    kids.push(page + ' 0 R');
    onProgress(i + 1, pages.length);
    if (i % 4 === 3) await new Promise((r) => setTimeout(r));
  }
  object(1, '<< /Type /Catalog /Pages 2 0 R >>');
  object(2, '<< /Type /Pages /Kids [' + kids.join(' ') + '] /Count ' + kids.length + ' >>');

  const xref = size;
  let table = 'xref\n0 ' + next + '\n0000000000 65535 f \n';
  for (let n = 1; n < next; n++) table += String(offsets[n]).padStart(10, '0') + ' 00000 n \n';
  write(table + 'trailer\n<< /Size ' + next + ' /Root 1 0 R >>\nstartxref\n' + xref + '\n%%EOF\n');
  return new Blob(parts, { type: 'application/pdf' });
}

/** Baixa um arquivo gerado no navegador. */
export function saveFile(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

/** Abre o diálogo de impressão do sistema com uma página por etiqueta. */
export function printWithDialog(pages) {
  if (!pages.length) return;
  const { wmm, hmm } = pages[0];
  const frame = document.createElement('iframe');
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
  document.body.appendChild(frame);
  const doc = frame.contentDocument;
  doc.open();
  doc.write('<!doctype html><html><head><title>Etiquetas</title><style>' +
    '@page{size:' + wmm + 'mm ' + hmm + 'mm;margin:0}' +
    'html,body{margin:0;padding:0}' +
    'img{display:block;width:' + wmm + 'mm;height:' + hmm + 'mm;break-after:page;page-break-after:always}' +
    'img:last-child{break-after:auto;page-break-after:auto}' +
    '</style></head><body></body></html>');
  doc.close();
  const loads = pages.map((p) => new Promise((res) => {
    const img = doc.createElement('img');
    img.onload = img.onerror = res;
    img.src = p.url;
    doc.body.appendChild(img);
  }));
  Promise.all(loads).then(() => {
    frame.contentWindow.focus();
    frame.contentWindow.print();
    setTimeout(() => frame.remove(), 60000);
  });
}
