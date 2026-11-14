#!/usr/bin/env node
// Real-browser check of the recorder PRD §4.7 budget: each keystroke handler under 1 ms p99,
// measured in a real JupyterLab, where `npm run bench` cannot see JupyterLab's own overhead.
//
// It builds a temporary assignment folder (signed with the monorepo's dev manifest, which the
// dev build trusts), starts JupyterLab and headless Chrome, turns on the extension's
// keystroke timing before the page loads (src/recorder/perf/keystroke-timing.ts), types real
// keystrokes through the DevTools Protocol, and reads back every handler's duration. It also
// checks that the log chain-validates and holds one doc.change per keystroke.
//
// Exits 1 if any p99 is over budget or the recording is wrong. Run it before a release, on
// the build you mean to ship: npm run build, then this script.
//
// Usage: node scripts/browser-keystroke-check.mjs [--keystrokes N] [--large]
//   --keystrokes N  keystrokes per document (default 1000)
//   --large         also type into a 2 MB notebook
// Env:   JUPYTER  the jupyter executable with provjup installed (default: jupyter on PATH)
//        CHROME   Chrome or Chromium (default: the usual install locations)
// Needs Node 22 or later, for the built-in WebSocket.

import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import url from 'node:url';

const BUDGET_MS = 1.0;
const MEASURE = 'provjup:keystroke';
const REPO = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '..');
const MANIFEST = path.join(REPO, 'vendor/provenance/test-workspace/.provenance-manifest');

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const option = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] !== undefined ? Number(args[i + 1]) : fallback;
};
const KEYSTROKES = option('--keystrokes', 1000);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ---------------------------------------------------------------- the assignment folder

function notebook(cells, cellBytes) {
  const line = 'x = np.arange(10)  # a line of student code\n';
  const source = line.repeat(Math.ceil(cellBytes / line.length)).slice(0, cellBytes);
  return JSON.stringify({
    nbformat: 4,
    nbformat_minor: 5,
    metadata: { kernelspec: { name: 'python3', display_name: 'Python 3', language: 'python' } },
    cells: Array.from({ length: cells }, (_, i) => ({
      id: `cell-${i}`,
      cell_type: 'code',
      metadata: {},
      source,
      outputs: [],
      execution_count: null,
    })),
  });
}

function makeAssignment(root) {
  const hw = path.join(root, 'hw1');
  fs.mkdirSync(hw, { recursive: true });
  fs.copyFileSync(MANIFEST, path.join(hw, '.provenance-manifest'));
  fs.writeFileSync(path.join(hw, 'homework.ipynb'), notebook(200, 500));
  if (flag('--large')) fs.writeFileSync(path.join(hw, 'large.ipynb'), notebook(200, 10_000));
  fs.writeFileSync(path.join(hw, 'util.py'), 'def helper():\n');
  return hw;
}

// ---------------------------------------------------------------- processes

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

function findChrome() {
  if (process.env.CHROME) return process.env.CHROME;
  const candidates = {
    win32: [
      'C:/Program Files/Google/Chrome/Application/chrome.exe',
      'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    ],
    darwin: ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'],
    linux: ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'],
  }[process.platform];
  return (candidates ?? []).find((p) => fs.existsSync(p));
}

function stop(child) {
  if (child.exitCode !== null) return;
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/pid', String(child.pid), '/t', '/f'], { stdio: 'ignore' });
  } else {
    child.kill('SIGTERM');
  }
}

async function waitFor(check, what, timeoutMs = 60_000) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    try {
      if (await check()) return;
    } catch {
      // not up yet
    }
    await sleep(250);
  }
  throw new Error(`timed out waiting for ${what}`);
}

// ---------------------------------------------------------------- DevTools Protocol

async function connect(debugPort) {
  const targets = await (await fetch(`http://127.0.0.1:${debugPort}/json`)).json();
  const page = targets.find((t) => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve) => ws.addEventListener('open', resolve, { once: true }));
  let id = 0;
  const pending = new Map();
  const console_ = [];
  ws.addEventListener('message', (m) => {
    const msg = JSON.parse(m.data);
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg);
      pending.delete(msg.id);
    } else if (msg.method === 'Runtime.consoleAPICalled') {
      console_.push(msg.params.args.map((a) => a.value ?? a.description ?? '').join(' '));
    }
  });
  const send = (method, params = {}) =>
    new Promise((resolve) => {
      const n = ++id;
      pending.set(n, resolve);
      ws.send(JSON.stringify({ id: n, method, params }));
    });
  const evaluate = async (expression) =>
    (await send('Runtime.evaluate', { expression, returnByValue: true })).result?.result?.value;
  const key = async (keyName, code, keyCode, modifiers = 0) => {
    for (const type of ['rawKeyDown', 'keyUp']) {
      await send('Input.dispatchKeyEvent', {
        type,
        key: keyName,
        code,
        windowsVirtualKeyCode: keyCode,
        modifiers,
      });
    }
  };
  return { ws, send, evaluate, key, console: console_ };
}

// ---------------------------------------------------------------- measuring

function percentile(sorted, p) {
  return sorted[Math.max(0, Math.ceil((p / 100) * sorted.length) - 1)] ?? 0;
}

/** Opens a document, types into the end of its last editor, and returns handler durations. */
async function typeInto(cdp, base, docPath, editorSelector) {
  await cdp.send('Page.navigate', { url: `${base}/lab/tree/hw1/${docPath}` });
  await waitFor(
    () => cdp.evaluate(`!!document.querySelector(${JSON.stringify(editorSelector)})`),
    `${docPath} to open`,
  );
  await sleep(3000);
  await cdp.evaluate(`performance.clearMeasures(${JSON.stringify(MEASURE)})`);
  await cdp.evaluate(`(() => {
    const all = document.querySelectorAll(${JSON.stringify(editorSelector)});
    const el = all[all.length - 1];
    el.scrollIntoView();
    el.focus();
    const view = el.cmView.view;
    view.dispatch({ selection: { anchor: view.state.doc.length } });
  })()`);
  await sleep(300);
  for (let i = 0; i < KEYSTROKES; i++) {
    if (i % 40 === 39) await cdp.key('Enter', 'Enter', 13);
    else await cdp.send('Input.insertText', { text: 'abcdefghij'[i % 10] });
    await sleep(15);
  }
  await sleep(500);
  const durations = await cdp.evaluate(
    `performance.getEntriesByName(${JSON.stringify(MEASURE)}).map((e) => e.duration)`,
  );
  await cdp.key('s', 'KeyS', 83, process.platform === 'darwin' ? 4 : 2);
  await sleep(2000);
  return durations ?? [];
}

function summarize(label, durations) {
  const sorted = [...durations].sort((a, b) => a - b);
  const stats = {
    label,
    n: sorted.length,
    p50: percentile(sorted, 50),
    p95: percentile(sorted, 95),
    p99: percentile(sorted, 99),
    max: sorted[sorted.length - 1] ?? 0,
  };
  const ms = (v) => `${v.toFixed(3)} ms`.padStart(10);
  console.log(
    `${label.padEnd(32)} n=${String(stats.n).padStart(5)}  p50${ms(stats.p50)}  ` +
      `p95${ms(stats.p95)}  p99${ms(stats.p99)}  max${ms(stats.max)}`,
  );
  return stats;
}

async function checkLog(hw) {
  const lc = await import(
    url.pathToFileURL(path.join(REPO, 'vendor/provenance/packages/log-core/dist/index.js')).href
  );
  const dir = path.join(hw, '.provenance');
  const counts = {};
  let chainOk = true;
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.slog'))) {
    const parsed = lc.parseEntries(fs.readFileSync(path.join(dir, file), 'utf8'));
    if (!parsed.ok || !lc.validateChain(parsed.value).ok) chainOk = false;
    if (!parsed.ok) continue;
    for (const e of parsed.value) {
      if (e.kind === 'doc.change') counts[e.data.path] = (counts[e.data.path] ?? 0) + 1;
    }
  }
  return { chainOk, counts };
}

// ---------------------------------------------------------------- main

async function main() {
  const chrome = findChrome();
  if (chrome === undefined) throw new Error('Chrome not found; set CHROME');
  if (!fs.existsSync(MANIFEST)) throw new Error(`missing ${MANIFEST}; init the submodule`);

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'provjup-keystroke-'));
  const hw = makeAssignment(path.join(tmp, 'root'));
  const [labPort, debugPort] = [await freePort(), await freePort()];
  const token = `check-${process.pid}`;
  const base = `http://127.0.0.1:${labPort}`;
  const children = [];
  try {
    const lab = spawn(
      process.env.JUPYTER ?? 'jupyter',
      [
        'lab',
        '--no-browser',
        `--port=${labPort}`,
        `--IdentityProvider.token=${token}`,
        `--ServerApp.root_dir=${path.join(tmp, 'root')}`,
      ],
      { stdio: ['ignore', 'ignore', fs.openSync(path.join(tmp, 'lab.log'), 'w')] },
    );
    children.push(lab);
    await waitFor(async () => (await fetch(`${base}/api?token=${token}`)).ok, 'JupyterLab');

    const browser = spawn(
      chrome,
      [
        '--headless=new',
        `--remote-debugging-port=${debugPort}`,
        `--user-data-dir=${path.join(tmp, 'chrome')}`,
        '--no-first-run',
        'about:blank',
      ],
      { stdio: 'ignore' },
    );
    children.push(browser);
    await waitFor(async () => (await fetch(`http://127.0.0.1:${debugPort}/json`)).ok, 'Chrome');

    const cdp = await connect(debugPort);
    await cdp.send('Runtime.enable');
    await cdp.send('Page.enable');
    await cdp.send('Page.addScriptToEvaluateOnNewDocument', {
      source: 'globalThis.__provjupTimeKeystrokes = true;',
    });
    // Log in once with the token; later navigations use the cookie.
    await cdp.send('Page.navigate', { url: `${base}/lab?token=${token}` });
    await waitFor(
      () => cdp.console.some((line) => line.includes('provjup:plugin: recording 1 assignment')),
      'provjup to start recording hw1 (is it installed and built?)',
    );

    const documents = [
      ['Homework notebook, 200 cells', 'homework.ipynb', '.jp-Notebook .jp-Cell .cm-content'],
      ...(flag('--large')
        ? [['Large notebook, 2 MB', 'large.ipynb', '.jp-Notebook .jp-Cell .cm-content']]
        : []),
      ['Text file', 'util.py', '.jp-FileEditor .cm-content'],
    ];
    console.log(`\nKeystroke handler time in real JupyterLab (${KEYSTROKES} keystrokes each):`);
    const results = [];
    for (const [label, docPath, selector] of documents) {
      results.push({ docPath, ...summarize(label, await typeInto(cdp, base, docPath, selector)) });
    }
    await cdp.send('Page.navigate', { url: 'about:blank' });
    await sleep(2000);
    cdp.ws.close();

    const log = await checkLog(hw);
    const problems = [];
    for (const r of results) {
      if (r.n === 0) problems.push(`${r.docPath}: no timings (rebuild with npm run build?)`);
      if (r.n !== KEYSTROKES) problems.push(`${r.docPath}: ${r.n} timings for ${KEYSTROKES} keys`);
      if (r.p99 > BUDGET_MS) problems.push(`${r.docPath}: p99 ${r.p99.toFixed(3)} ms > 1 ms`);
      if ((log.counts[r.docPath] ?? 0) !== r.n) {
        problems.push(`${r.docPath}: ${log.counts[r.docPath] ?? 0} doc.change for ${r.n} keys`);
      }
    }
    if (!log.chainOk) problems.push('a log failed to parse or chain-validate');
    console.log(
      `\nLog: chain ${log.chainOk ? 'valid' : 'INVALID'}; doc.change per file`,
      log.counts,
    );
    if (problems.length > 0) {
      console.log('\nFAILED:\n  ' + problems.join('\n  '));
      process.exitCode = 1;
    } else {
      console.log(`\nPASSED: every p99 is under ${BUDGET_MS} ms, and the log is exact.`);
    }
  } finally {
    for (const child of children.reverse()) stop(child);
    await sleep(500);
    fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 });
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
