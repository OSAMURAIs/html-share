// Minimal zero-dependency Chrome DevTools Protocol client.
// Node 22+ ships a global WebSocket, so the visual harness needs no browser
// automation dependency and stays inside the repository's no-external-runtime rule.
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const CHROME_CANDIDATES = [
  process.env.HTML_SHARE_VISUAL_CHROME,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'Google/Chrome/Application/chrome.exe') : null,
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter(Boolean);

export function resolveChrome() {
  const found = CHROME_CANDIDATES.find((candidate) => existsSync(candidate));
  if (!found) throw new Error(`Chrome not found. Set HTML_SHARE_VISUAL_CHROME. Tried:\n${CHROME_CANDIDATES.join('\n')}`);
  return found;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function readDevToolsEndpoint(userDataDir, deadline) {
  const portFile = path.join(userDataDir, 'DevToolsActivePort');
  while (Date.now() < deadline) {
    if (existsSync(portFile)) {
      const [port] = readFileSync(portFile, 'utf8').split('\n');
      if (port && port.trim()) return Number(port.trim());
    }
    await sleep(50);
  }
  throw new Error('Chrome did not expose a DevTools port in time');
}

class Session {
  #socket;
  #nextId = 1;
  #pending = new Map();
  #listeners = new Map();

  constructor(socket) {
    this.#socket = socket;
    socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      if (message.id !== undefined) {
        const entry = this.#pending.get(message.id);
        if (!entry) return;
        this.#pending.delete(message.id);
        if (message.error) entry.reject(new Error(`${message.error.message} (${entry.method})`));
        else entry.resolve(message.result);
        return;
      }
      for (const listener of this.#listeners.get(message.method) ?? []) listener(message.params);
    });
  }

  send(method, params = {}) {
    const id = this.#nextId++;
    return new Promise((resolve, reject) => {
      this.#pending.set(id, { resolve, reject, method });
      this.#socket.send(JSON.stringify({ id, method, params }));
    });
  }

  on(method, listener) {
    if (!this.#listeners.has(method)) this.#listeners.set(method, []);
    this.#listeners.get(method).push(listener);
    return () => {
      const list = this.#listeners.get(method) ?? [];
      const index = list.indexOf(listener);
      if (index >= 0) list.splice(index, 1);
    };
  }

  close() { this.#socket.close(); }
}

export async function launchChrome({ timeoutMs = 30000 } = {}) {
  const executable = resolveChrome();
  const userDataDir = mkdtempSync(path.join(tmpdir(), 'html-share-visual-'));
  const child = spawn(executable, [
    '--headless=new',
    '--remote-debugging-port=0',
    `--user-data-dir=${userDataDir}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    '--disable-background-networking',
    '--disable-component-update',
    '--disable-sync',
    '--disable-features=Translate,MediaRouter,OptimizationHints',
    '--force-device-scale-factor=1',
    '--hide-scrollbars',
    '--mute-audio',
    '--force-color-profile=srgb',
    '--font-render-hinting=none',
    '--disable-lcd-text',
    'about:blank',
  ], { stdio: ['ignore', 'ignore', 'ignore'] });

  const port = await readDevToolsEndpoint(userDataDir, Date.now() + timeoutMs);
  const versionResponse = await fetch(`http://127.0.0.1:${port}/json/version`);
  const version = await versionResponse.json();

  return {
    port,
    version,
    executable,
    async newPage() {
      const created = await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' });
      const target = await created.json();
      const socket = new WebSocket(target.webSocketDebuggerUrl);
      await new Promise((resolve, reject) => {
        socket.addEventListener('open', resolve, { once: true });
        socket.addEventListener('error', () => reject(new Error('DevTools socket failed')), { once: true });
      });
      const session = new Session(socket);
      session.targetId = target.id;
      return session;
    },
    async closePage(session) {
      session.close();
      await fetch(`http://127.0.0.1:${port}/json/close/${session.targetId}`).catch(() => {});
    },
    async close() {
      child.kill();
      await sleep(150);
      rmSync(userDataDir, { recursive: true, force: true, maxRetries: 5 });
    },
  };
}
