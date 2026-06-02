import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { streamLaunchPlan, sseEvent } from '../agent/launchDeskAgent.mjs';

const root = new URL('../..', import.meta.url).pathname;
const port = Number(process.env.PORT || 5178);

const types = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
]);

async function readJson(req) {
  let body = '';
  for await (const chunk of req) body += chunk;
  return body ? JSON.parse(body) : {};
}

async function serveStatic(req, res) {
  const url = new URL(req.url || '/', `http://${req.headers.host}`);
  const requested = url.pathname === '/' ? '/index.html' : url.pathname;
  const safePath = normalize(requested).replace(/^([/\\])+/, '');
  const filePath = join(root, safePath);
  if (!filePath.startsWith(root)) {
    res.writeHead(403).end('Forbidden');
    return;
  }
  try {
    const body = await readFile(filePath);
    res.writeHead(200, { 'Content-Type': types.get(extname(filePath)) || 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404).end('Not found');
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host}`);
  if (url.pathname === '/api/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, hasOpenAIKey: Boolean(process.env.OPENAI_API_KEY), model: process.env.OPENAI_MODEL || 'gpt-5.4-mini' }));
    return;
  }

  if (url.pathname === '/api/launch-plan' && req.method === 'POST') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });
    try {
      const input = await readJson(req);
      await streamLaunchPlan(input, res);
    } catch (error) {
      res.write(sseEvent('error', { message: error instanceof Error ? error.message : String(error) }));
    } finally {
      res.end();
    }
    return;
  }

  await serveStatic(req, res);
});

server.listen(port, () => {
  console.log(`Launch Desk running at http://localhost:${port}`);
  console.log(`OpenAI key visible to server: ${process.env.OPENAI_API_KEY ? 'yes' : 'no'}`);
});
