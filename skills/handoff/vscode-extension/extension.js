const vscode = require('vscode');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');

// The id ends up typed into a shell, so nothing but a session id or slug gets through.
const SESSION_ID = /^[A-Za-z0-9_-]+$/;

let server;
let socketPath;

function openAttachTerminal(id, cwd, name) {
  // Named explicitly: `claude attach` never titles the tab with the session's --name, so ${sequence}
  // can't be relied on. No show(): the user stays where they are.
  const terminal = vscode.window.createTerminal({
    name: name || undefined,
    cwd: cwd && fs.statSync(cwd, { throwIfNoEntry: false })?.isDirectory() ? cwd : undefined,
  });
  terminal.sendText(`claude attach ${id}`);
}

// Background sessions inherit the Claude daemon's env, which can hold another window's socket path.
// Only act for a caller whose process ancestry runs through one of this window's terminals.
async function isOwnTerminal(callerPids) {
  const callers = new Set(callerPids.split(','));
  const shells = await Promise.all(vscode.window.terminals.map((t) => t.processId));
  return shells.some((pid) => pid !== undefined && callers.has(String(pid)));
}

function activate(context) {
  // One extension host per window, so its pid names this window's socket.
  socketPath = path.join(os.tmpdir(), `claude-attach-${process.pid}.sock`);
  fs.rmSync(socketPath, { force: true });

  server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const id = url.searchParams.get('id') ?? '';
    if (url.pathname !== '/attach' || !SESSION_ID.test(id)) return res.writeHead(400).end();
    if (!(await isOwnTerminal(url.searchParams.get('pids') ?? ''))) return res.writeHead(409).end();
    openAttachTerminal(id, url.searchParams.get('cwd'), url.searchParams.get('name'));
    res.writeHead(204).end();
  });
  server.on('error', (err) => console.error('[claude-attach] socket unavailable:', err));
  server.listen(socketPath, () => {
    fs.chmodSync(socketPath, 0o600);
    const env = context.environmentVariableCollection;
    // Not persisted: a terminal restored on the next launch must not get this run's socket path.
    env.persistent = false;
    env.description = 'Lets /handoff open a Claude attach terminal in this window';
    env.replace('CLAUDE_ATTACH_SOCK', socketPath);
  });

  // Fallback for callers that can't reach the socket. VS Code delivers the link to the last-focused
  // window, so there's no ownership check to make.
  context.subscriptions.push(
    vscode.window.registerUriHandler({
      handleUri(uri) {
        const query = new URLSearchParams(uri.query);
        const id = query.get('id') ?? '';
        if (uri.path === '/attach' && SESSION_ID.test(id)) openAttachTerminal(id, query.get('cwd'), query.get('name'));
      },
    }),
  );
}

function deactivate() {
  server?.close();
  if (socketPath) fs.rmSync(socketPath, { force: true });
}

module.exports = { activate, deactivate };
