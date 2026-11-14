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

// Saída do CUPS sempre em inglês: os textos lidos abaixo mudam com o idioma do sistema.
const ENV = { ...process.env, LC_ALL: 'C' };

function run(cmd, args) {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout: 5000, env: ENV }, (err, stdout) => resolve(err ? '' : stdout));
  });
}

function runOrFail(cmd, args) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { timeout: 10000, env: ENV }, (err, _out, stderr) => {
      if (err) reject(new Error(String(stderr).trim() || err.message));
      else resolve();
    });
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

/*
 * Estado da fila do CUPS antes de imprimir. O Ubuntu, ao ligar a impressora,
 * pode deixar na fila um trabalho "Automatic configuration" do driver errado,
 * e o CUPS pausa a fila se ela for desligada no meio de uma impressão. Nos dois
 * casos as etiquetas ficariam esperando sem aviso.
 * O nome da fila costuma começar com "-" (ex.: "-9X10"), por isso vai grudado
 * na opção (-P-9X10, -p-9X10): separado, os comandos o leem como opção.
 */
async function queue(id) {
  if (!id.startsWith('cups:')) return { paused: false, jobs: [] };
  const name = id.slice(5);
  const [state, lpq] = await Promise.all([run('lpstat', ['-p' + name]), run('lpq', ['-P' + name])]);
  const jobs = [];
  for (const line of lpq.split('\n')) {
    // "1st     lucas   5       Documento                       1024 bytes"
    const m = line.match(/^\S+\s+\S+\s+(\d+)\s+(.*?)\s+\d+ bytes$/);
    if (m) jobs.push({ id: Number(m[1]), title: m[2] });
  }
  return { paused: / disabled /.test(state), jobs };
}

// Cancela o que está na fila e reativa a fila pausada (o usuário está no grupo lpadmin).
async function clear(id) {
  if (!id.startsWith('cups:')) return { ok: true };
  const q = await queue(id);
  if (q.jobs.length) await runOrFail('cancel', q.jobs.map((j) => String(j.id)));
  if (q.paused) await runOrFail('lpadmin', ['-p', id.slice(5), '-E']);
  return { ok: true };
}

module.exports = { list, print, queue, clear };
