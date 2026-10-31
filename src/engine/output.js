/* Leitura de arquivos, geração do PDF e impressão pelo diálogo do sistema. */
import { jsPDF } from 'jspdf';
import JSZip from 'jszip';

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

export function buildPdf(pages) {
  let doc = null;
  for (const p of pages) {
    const orient = p.wmm > p.hmm ? 'landscape' : 'portrait';
    if (!doc) doc = new jsPDF({ unit: 'mm', format: [p.wmm, p.hmm], orientation: orient, compress: true });
    else doc.addPage([p.wmm, p.hmm], orient);
    doc.addImage(p.canvas, 'PNG', 0, 0, p.wmm, p.hmm, undefined, 'FAST');
  }
  return doc;
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
