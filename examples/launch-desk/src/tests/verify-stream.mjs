const endpoint = process.env.LAUNCH_DESK_URL || 'http://localhost:5178/api/launch-plan';
const payload = {
  productBrief: 'Launch a developer-facing audit log export API for enterprise admins. It includes scoped API keys, CSV export, and webhook delivery for compliance workflows.',
  audience: 'Enterprise security admins and developer platform teams',
  launchDate: '2026-08-20',
  constraints: 'Legal review and security review must finish before GA. Beta is limited to five design partners.',
  assets: 'API docs draft, architecture diagram, demo app, screenshots, support FAQ, and sales one-pager.',
};

const response = await fetch(endpoint, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(payload),
});

if (!response.ok || !response.body) {
  throw new Error(`Expected streamed response, got ${response.status}`);
}

const reader = response.body.getReader();
const decoder = new TextDecoder();
let buffer = '';
let sawToolProgress = false;
let sawModelDelta = false;
let sawError = '';

for (;;) {
  const { value, done } = await reader.read();
  if (done) break;
  buffer += decoder.decode(value, { stream: true });
  const chunks = buffer.split('\n\n');
  buffer = chunks.pop() || '';
  for (const chunk of chunks) {
    const eventType = chunk.split('\n').find((line) => line.startsWith('event: '))?.slice(7);
    const dataLine = chunk.split('\n').find((line) => line.startsWith('data: '));
    const data = dataLine ? JSON.parse(dataLine.slice(6)) : {};
    if (eventType === 'tool_progress') sawToolProgress = true;
    if (eventType === 'model_delta' && data.delta) sawModelDelta = true;
    if (eventType === 'error') sawError = `${data.message || ''} ${data.detail || ''}`.trim();
    if (sawToolProgress && sawModelDelta) {
      console.log(JSON.stringify({ ok: true, sawToolProgress, sawModelDelta }));
      process.exit(0);
    }
  }
}

throw new Error(`Stream ended before verification succeeded. tool=${sawToolProgress} delta=${sawModelDelta} error=${sawError || 'none'}`);
