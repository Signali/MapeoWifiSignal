// `node docs/build-pdf.mjs [salida.pdf]`: genera docs/SignalMap-Hito2-Documento-Tecnico.pdf (u otra
// ruta, si se indica) desde
// docs/documento-tecnico.md, con Edge o Chrome en modo headless. Sin dependencias del repo:
// Markdown (marked) y diagramas (mermaid) se cargan del CDN, con versión fija, al generar.
// El navegador se maneja por el protocolo de DevTools para numerar las páginas sin que el
// pie muestre la ruta local del archivo.
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';

const DOCS = new URL('.', import.meta.url);
const SOURCE = new URL('documento-tecnico.md', DOCS);
const OUTPUT = process.argv[2] ?? new URL('SignalMap-Hito2-Documento-Tecnico.pdf', DOCS);
const PORT = 9333;
const BROWSERS = [
  process.env.BROWSER,
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
];

const CSS = `
@page { size: A4; margin: 18mm 17mm 20mm; }
:root { --navy: #1e3a6b; --navy-2: #33507e; --gold: #e9b200; --ink: #1f2937; --muted: #6b7280; --line: #dbe2ec; --soft: #f4f6fa; }
* { box-sizing: border-box; }
body { margin: 0; font: 9.6pt/1.5 Inter, system-ui, sans-serif; color: var(--ink); background: #fff; }
.cover { height: 254mm; padding: 26mm 18mm; border-radius: 3mm; background: var(--navy); color: #fff; break-after: page; display: flex; flex-direction: column; }
.cover .uni { font-weight: 600; font-size: 12pt; }
.cover .brand { font: 700 54pt/1 'Playfair Display', serif; margin: 46mm 0 4mm; }
.cover .brand span { color: var(--gold); }
.cover .bar { width: 16mm; height: 1.2mm; background: var(--gold); margin-top: 40mm; }
.cover .sub { font: 500 10pt 'JetBrains Mono', monospace; letter-spacing: .18em; text-transform: uppercase; color: #a9c4ee; }
.cover .meta { margin-top: auto; padding: 6mm 7mm; background: var(--navy-2); border-radius: 3mm; color: #e5edf9; font-size: 9.5pt; }
.cover .meta p { margin: 0 0 2mm; }
.cover .meta code { background: none; color: #a9c4ee; padding: 0; }
.cover .meta strong { color: var(--gold); }
.cover a { color: #a9c4ee; }
h2 { font: 700 17pt/1.2 'Playfair Display', serif; color: var(--navy); margin: 0 0 4mm; padding-bottom: 2mm; border-bottom: .5mm solid var(--navy); break-after: avoid; }
h2.section { break-before: page; }
h3 { font: 700 11.5pt/1.3 'Playfair Display', serif; color: var(--navy); margin: 6mm 0 2mm; break-after: avoid; }
.num { color: var(--gold); font-family: Inter, sans-serif; font-size: .78em; margin-right: 2mm; }
p, li { margin: 0 0 2.4mm; }
ul, ol { padding-left: 5mm; margin: 0 0 3mm; }
strong { color: #111827; }
a { color: var(--navy); overflow-wrap: anywhere; }
code { font: 8.4pt 'JetBrains Mono', monospace; font-variant-ligatures: none; font-feature-settings: 'liga' 0, 'calt' 0; background: var(--soft); padding: .2mm 1mm; border-radius: .8mm; }
pre { background: var(--soft); border-left: .8mm solid var(--gold); padding: 3mm 4mm; border-radius: 1mm; overflow: hidden; white-space: pre-wrap; break-inside: avoid; }
pre code { background: none; padding: 0; font-size: 8pt; }
table { width: 100%; border-collapse: collapse; margin: 2mm 0 4mm; font-size: 8.3pt; line-height: 1.38; }
thead { display: table-header-group; }
tr { break-inside: avoid; }
th { background: var(--navy); color: #fff; text-align: left; font-weight: 600; padding: 1.6mm 2mm; }
td { padding: 1.4mm 2mm; border-bottom: .25mm solid var(--line); vertical-align: top; }
tbody tr:nth-child(even) td { background: #f8fafc; }
td code, th code { font-size: 7.6pt; }
th code { background: rgba(255,255,255,.16); color: #fff; }
.mermaid .node rect, .mermaid .node path, .mermaid .node polygon, .mermaid rect.actor { fill: #eef2f8 !important; stroke: #1e3a6b !important; }
.mermaid .plot rect { fill: #1e3a6b !important; }
.mermaid .edgeLabel, .mermaid .edgeLabel rect, .mermaid .labelBkg { background: #fff !important; fill: #fff !important; }
.mermaid .note { fill: #fff8e1 !important; stroke: #e9b200 !important; }
hr { display: none; }
.mermaid { display: flex; justify-content: center; margin: 3mm 0 5mm; break-inside: avoid; }
.mermaid svg { max-width: 100%; height: auto; }
.ref { padding-left: 8mm; text-indent: -8mm; font-size: 8.8pt; }
.bars { margin: 3mm 0 5mm; break-inside: avoid; }
.bars p { font-weight: 600; color: var(--navy); margin: 0 0 2mm; }
.bars div { display: grid; grid-template-columns: 22mm 1fr 20mm; align-items: center; gap: 3mm; margin: 0 0 1.6mm; }
.bars i { display: block; height: 4.5mm; background: var(--navy); border-radius: .8mm; }
.bars b { font-weight: 500; font-variant-numeric: tabular-nums; }
.stack { margin: 3mm 0 5mm; break-inside: avoid; }
.stack div { display: flex; height: 15mm; border-radius: 1mm; overflow: hidden; }
.stack i { display: flex; flex-direction: column; justify-content: center; padding: 0 1.5mm; color: #fff; font-style: normal; font-size: 7.8pt; line-height: 1.25; overflow: hidden; white-space: nowrap; }
.stack small { opacity: .85; }
.stack .s1 { background: #6b7280; } .stack .s2 { background: var(--navy); } .stack .s3 { background: #33507e; } .stack .s4 { background: #b58a00; } .stack .s5 { background: var(--gold); color: #1f2937; }
.kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 5mm; margin: 3mm 0 6mm; break-inside: avoid; }
.kpis div { border-top: .8mm solid var(--gold); padding-top: 2.5mm; }
.kpis b { display: block; font: 700 20pt/1.1 Inter, sans-serif; color: var(--navy); font-variant-numeric: lining-nums; }
.hitos { margin: 3mm 0 5mm; break-inside: avoid; font-size: 8.8pt; }
.hitos div { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 0 9mm; }
.hitos span { padding: 2mm 0; border-bottom: .25mm solid var(--line); position: relative; }
.hitos div:not(.h) span:not(:last-child)::after { content: '→'; position: absolute; right: -6.5mm; top: 2mm; color: var(--gold); font-weight: 700; }
.hitos .h span { font-weight: 700; color: var(--navy); border-bottom: .6mm solid var(--navy); }
.hitos .vacio { color: var(--muted); font-style: italic; }
.split { display: grid; grid-template-columns: 1fr 1fr; gap: 7mm; margin: 3mm 0 5mm; break-inside: avoid; }
.split p { font-weight: 700; color: var(--navy); margin: 0 0 1.5mm; padding-bottom: 1.5mm; border-bottom: .6mm solid var(--gold); }
.split ul { margin: 0; padding-left: 4mm; font-size: 9pt; }
.kpis span { display: block; font-size: 8.4pt; color: var(--muted); margin-top: 1mm; line-height: 1.35; }
.toc { break-after: page; }
.toc-title { font: 700 17pt/1.2 'Playfair Display', serif; color: var(--navy); padding-bottom: 2mm; border-bottom: .5mm solid var(--navy); margin-bottom: 4mm; }
.toc ol { list-style: none; padding: 0; margin: 0; }
.toc li { display: flex; align-items: baseline; gap: 2mm; margin: 0 0 .7mm; line-height: 1.35; }
.toc li.h2 { font-weight: 600; margin-top: 2mm; }
.toc li.h3 { padding-left: 7mm; font-size: 8.8pt; color: #374151; }
.toc .dots { flex: 1; border-bottom: .3mm dotted #9ca3af; transform: translateY(-1mm); }
.toc .pg { font-variant-numeric: tabular-nums; min-width: 6mm; text-align: right; }
`;

const PAGE = (markdown, tocPages) => `<!doctype html><html lang="es"><head><meta charset="utf-8">
<title>SignalMap · Hito 2 · Documento técnico</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&family=Playfair+Display:wght@700&display=swap">
<style>${CSS}</style>
<script src="https://cdn.jsdelivr.net/npm/marked@12.0.2/marked.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/mermaid@11.4.1/dist/mermaid.min.js"></script>
</head><body><main id="doc"></main><script>
(async () => {
  // Antes de crear cualquier diagrama: si no, Mermaid los dibuja solo al cargar la página
  // con su configuración por defecto, y mermaid.run() después los saltea.
  mermaid.initialize({ startOnLoad: false, theme: 'base', themeVariables: { primaryColor: '#eef2f8', primaryBorderColor: '#1e3a6b', primaryTextColor: '#1f2937', lineColor: '#1e3a6b', fontFamily: 'Inter, sans-serif', fontSize: '13px', clusterBkg: '#f8fafc', clusterBorder: '#1e3a6b', xyChart: { plotColorPalette: '#1e3a6b', backgroundColor: '#ffffff' } }, flowchart: { useMaxWidth: false }, xyChart: { useMaxWidth: false, width: 560, height: 260 } });
  const doc = document.getElementById('doc');
  doc.innerHTML = marked.parse(${JSON.stringify(markdown)});
  // Portada: todo lo anterior al primer h2 (título y datos del equipo).
  const cover = document.createElement('section');
  cover.className = 'cover';
  while (doc.firstChild && doc.firstChild.tagName !== 'H2') cover.append(doc.firstChild);
  const h1 = cover.querySelector('h1');
  const [, sub = ''] = h1.textContent.split(' · ');
  const meta = document.createElement('div');
  meta.className = 'meta';
  meta.append(...cover.querySelectorAll('p'));
  cover.innerHTML = '<div class="uni">Universidad Mayor</div><div class="bar"></div>'
    + '<div class="brand">Signal<span>Map</span></div><div class="sub">' + sub + '</div>';
  cover.append(meta);
  doc.prepend(cover);
  // Índice: un renglón por h2/h3, con la página que da la primera pasada ("00" mientras tanto).
  const tocPages = ${JSON.stringify(tocPages)};
  const toc = document.createElement('section');
  toc.className = 'toc';
  toc.innerHTML = '<div class="toc-title">Índice</div><ol></ol>';
  doc.querySelectorAll('h2, h3').forEach((h, i) => {
    const li = document.createElement('li');
    li.className = h.tagName.toLowerCase();
    li.innerHTML = '<span></span><span class="dots"></span><span class="pg"></span>';
    li.firstChild.textContent = h.textContent.replace(/^(\\d+(\\.\\d+)?)\\.\\s+/, '$1 ');
    li.lastChild.textContent = tocPages ? tocPages[i] : '00';
    toc.lastChild.append(li);
  });
  cover.after(toc);
  // Cada sección principal empieza en página nueva; el número va en dorado.
  doc.querySelectorAll('h2, h3').forEach((h) => {
    const m = h.textContent.match(/^(\\d+(\\.\\d+)?)\\.?\\s+(.*)$/);
    if (m) h.innerHTML = '<span class="num">' + m[1] + '</span>' + h.innerHTML.replace(/^\\d+(\\.\\d+)?\\.?\\s+/, '');
    if (h.tagName === 'H2' && !/^Resumen/.test(h.textContent)) h.classList.add('section');
  });
  // Referencias con sangría francesa (APA).
  const refs = [...doc.querySelectorAll('h2')].find((h) => h.textContent === 'Referencias');
  for (let el = refs?.nextElementSibling; el?.tagName === 'P'; el = el.nextElementSibling) el.classList.add('ref');
  // Diagramas.
  doc.querySelectorAll('pre code.language-mermaid').forEach((code) => {
    const div = document.createElement('div');
    div.className = 'mermaid';
    div.textContent = code.textContent;
    code.parentElement.replaceWith(div);
  });
  await Promise.all(['400 13px Inter', '600 13px Inter', '700 20px "Playfair Display"', '400 13px "JetBrains Mono"'].map((f) => document.fonts.load(f)));
  await mermaid.run({ querySelector: '.mermaid' });
  await document.fonts.ready;
  document.body.dataset.ready = '1';
})().catch((e) => { document.body.dataset.ready = 'error: ' + e.message; });
</script></body></html>`;

const browser = BROWSERS.find((path) => path && existsSync(path));
if (!browser) throw new Error('No se encontró Edge ni Chrome: indicar la ruta con la variable BROWSER');

// Página de cada título según el esquema (outline) del PDF, en orden de documento.
function headingPages(pdf) {
  const text = pdf.toString('latin1');
  const objects = new Map([...text.matchAll(/(\d+) 0 obj([\s\S]*?)endobj/g)].map((m) => [Number(m[1]), m[2]]));
  const ref = (body, key) => Number(body?.match(new RegExp(`/${key}\\s+(\\d+) 0 R`))?.[1]) || null;
  const root = objects.get(Number(text.match(/\/Root\s+(\d+) 0 R/)[1]));
  const order = [];
  const walkPages = (id) => {
    const body = objects.get(id);
    if (!/\/Type\s*\/Pages/.test(body)) return order.push(id);
    for (const kid of body.match(/\/Kids\s*\[([^\]]*)\]/)[1].matchAll(/(\d+) 0 R/g)) walkPages(Number(kid[1]));
  };
  walkPages(ref(root, 'Pages'));
  const result = [];
  const walkOutline = (id) => {
    for (let item = id; item; item = ref(objects.get(item), 'Next')) {
      const dest = Number(objects.get(item).match(/\/Dest\s*\[(\d+) 0 R/)?.[1]);
      result.push(order.indexOf(dest) + 1);
      const child = ref(objects.get(item), 'First');
      if (child) walkOutline(child);
    }
  };
  walkOutline(ref(objects.get(ref(root, 'Outlines')), 'First'));
  return result;
}

const markdown = readFileSync(SOURCE, 'utf8');
const work = mkdtempSync(join(tmpdir(), 'signalmap-pdf-'));
const html = join(work, 'documento.html');

const child = spawn(browser, ['--headless=new', '--disable-gpu', `--remote-debugging-port=${PORT}`, `--user-data-dir=${join(work, 'perfil')}`, 'about:blank'], { stdio: 'ignore' });
try {
  let pages;
  for (let i = 0; i < 100 && !pages; i++) {
    try { pages = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json(); } catch { await sleep(100); }
  }
  const target = pages?.find((p) => p.type === 'page');
  if (!target) throw new Error('El navegador no abrió el protocolo de DevTools');

  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
  let nextId = 0;
  const pending = new Map();
  ws.onmessage = ({ data }) => {
    const msg = JSON.parse(data);
    if (pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
  };
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++nextId;
    pending.set(id, (msg) => (msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result)));
    ws.send(JSON.stringify({ id, method, params }));
  });

  const evaluate = async (expression) => (await send('Runtime.evaluate', { expression, returnByValue: true })).result.value;
  const footer = '<div style="width:100%;font:7.5pt Inter,sans-serif;color:#6b7280;padding:0 17mm;display:flex;justify-content:space-between">'
    + '<span>SignalMap · Hito 2 · Documento técnico</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>';
  const render = async (tocPages) => {
    writeFileSync(html, PAGE(markdown, tocPages));
    await send('Page.navigate', { url: pathToFileURL(html).href });
    let ready = '';
    for (let i = 0; i < 300 && ready !== '1'; i++) {
      await sleep(100);
      ready = await evaluate('document.body?.dataset.ready ?? ""');
      if (ready.startsWith('error')) break;
    }
    if (ready !== '1') throw new Error(`La página no terminó de armarse (${ready || 'tiempo agotado'}); ¿hay conexión al CDN?`);
    const headings = await evaluate('document.querySelectorAll("#doc h2, #doc h3").length');
    const { data } = await send('Page.printToPDF', {
    printBackground: true,
    generateDocumentOutline: true,
    preferCSSPageSize: true,
    displayHeaderFooter: true,
    headerTemplate: '<span></span>',
    footerTemplate: footer,
    });
    const pdf = Buffer.from(data, 'base64');
    const pages = headingPages(pdf);
    if (pages.length !== headings || pages.includes(0)) throw new Error(`El esquema del PDF no coincide con los títulos (${pages.length} de ${headings})`);
    return { pdf, pages };
  };

  // Primera pasada con el índice en "00": la paginación ya es la final. Segunda, con los números.
  const first = await render(null);
  const final = await render(first.pages);
  if (final.pages.join() !== first.pages.join()) throw new Error('La paginación cambió entre pasadas: revisar el índice');
  writeFileSync(OUTPUT, final.pdf);
  const pagesCount = (readFileSync(OUTPUT, 'latin1').match(/\/Type\s*\/Page[^s]/g) ?? []).length;
  console.log(`PDF generado: ${process.argv[2] ?? 'docs/SignalMap-Hito2-Documento-Tecnico.pdf'} (${pagesCount} páginas)`);
  ws.close();
} finally {
  child.kill();
  await sleep(500);
  rmSync(work, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
