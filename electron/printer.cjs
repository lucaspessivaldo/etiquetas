/*
 * Impressoras térmicas de etiqueta (TSPL) no Linux, sem driver.
 *
 * Procura de dois jeitos:
 *  - filas do CUPS ligadas por USB a impressoras "LABEL"/"POS": envia com
 *    `lp -o raw`, que pula o driver (o CUPS costuma escolher um driver errado);
 *  - /dev/usb/lp* com permissão de escrita (usuário no grupo "lp").
 */
const { execFile, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

function run(cmd, args) {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout: 5000 }, (err, stdout) => resolve(err ? '' : stdout));
  });
}

// Nome do aparelho USB (ex.: "POS Label Printer"), lido do sistema.
function usbProductName(dev) {
  try {
    const base = path.join('/sys/class/usbmisc', dev, 'device', '..');
    return fs.readFileSync(path.join(base, 'product'), 'utf8').trim();
  } catch (e) {
    return null;
  }
}

async function list() {
  const printers = [];
  const out = await run('lpstat', ['-v']);
  for (const line of out.split('\n')) {
    // "device for NOME: usb://LABEL/..."
    const m = line.match(/^device for (.+?): (usb:\/\/\S+)/);
    if (!m) continue;
    const uri = m[2].toUpperCase();
    if (uri.includes('LABEL') || uri.includes('POS')) {
      printers.push({ id: 'cups:' + m[1], name: 'Impressora de etiquetas USB', detail: 'fila ' + m[1] + ' do CUPS' });
    }
  }
  if (!printers.length) {
    let devs = [];
    try { devs = fs.readdirSync('/dev/usb').filter((f) => /^lp\d+$/.test(f)); } catch (e) { /* sem USB */ }
    for (const d of devs) {
      const file = '/dev/usb/' + d;
      try { fs.accessSync(file, fs.constants.W_OK); } catch (e) { continue; }
      printers.push({ id: 'dev:' + file, name: usbProductName(d) || 'Impressora USB', detail: file });
    }
  }
  return printers;
}

function print(id, data, title) {
  const buf = Buffer.from(data);
  if (id.startsWith('dev:')) return fs.promises.writeFile(id.slice(4), buf).then(() => ({ ok: true }));
  if (!id.startsWith('cups:')) return Promise.reject(new Error('Impressora inválida'));
  return new Promise((resolve, reject) => {
    const child = spawn('lp', ['-d', id.slice(5), '-o', 'raw', '-t', title || 'etiquetas']);
    let err = '';
    child.stderr.on('data', (d) => { err += d; });
    child.on('error', reject);
    child.on('close', (code) => (code === 0 ? resolve({ ok: true }) : reject(new Error(err.trim() || 'Falha ao enviar (lp ' + code + ')'))));
    child.stdin.end(buf);
  });
}

module.exports = { list, print };
