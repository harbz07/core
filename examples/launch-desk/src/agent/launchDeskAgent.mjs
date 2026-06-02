import { randomUUID } from 'node:crypto';
import { runLaunchDeskTools } from '../tools/launchTools.mjs';

export const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-5.4-mini';
export const OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses';

export const launchDeskInstructions = `You are Launch Desk, a senior launch-planning agent for engineering-led product releases.
Turn rough launch notes into an actionable release plan. Always include these sections:
1. Prioritized plan with P0/P1/P2 sequencing and rationale.
2. Risk register with severity, owner, and mitigation.
3. Owner checklist grouped by team/person.
4. Channel-specific launch copy suggestions for email, in-app, blog, social, and sales enablement.
5. Follow-up questions when key details are missing.
Use concise bullets, specific owners when provided, and pragmatic engineering release planning language.`;

export function buildAgentPrompt(toolContext) {
  return `${launchDeskInstructions}

User launch input:
${JSON.stringify(toolContext.input, null, 2)}

Tool outputs from Launch Desk planning tools:
${JSON.stringify({
    missingDetails: toolContext.missingDetails,
    extractedTasks: toolContext.tasks,
    readiness: toolContext.readiness,
    ownerChecklists: toolContext.checklists,
    channelCopyDrafts: toolContext.copy,
  }, null, 2)}

Create the final launch plan now. If critical fields are missing, still provide a provisional plan and put follow-up questions near the top.`;
}

export function sseEvent(type, payload) {
  return `event: ${type}\ndata: ${JSON.stringify(payload)}\n\n`;
}

export async function streamLaunchPlan(input, writable, options = {}) {
  const traceId = options.traceId || randomUUID();
  const startedAt = new Date().toISOString();
  writable.write(sseEvent('trace', { traceId, startedAt, model: options.model || OPENAI_MODEL, transport: 'responses-api-stream' }));

  const toolContext = await runLaunchDeskTools(input, (event) => {
    writable.write(sseEvent('tool_progress', { traceId, ...event }));
  });

  const apiKey = options.apiKey || process.env.OPENAI_API_KEY;
  if (!apiKey) {
    writable.write(sseEvent('error', { traceId, message: 'OPENAI_API_KEY is not set for the server process.' }));
    writable.write(sseEvent('done', { traceId, ok: false }));
    return;
  }

  const response = await fetch(OPENAI_RESPONSES_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: options.model || OPENAI_MODEL,
      instructions: launchDeskInstructions,
      input: buildAgentPrompt(toolContext),
      stream: true,
      metadata: { app: 'launch-desk', trace_id: traceId },
      reasoning: { effort: 'low' },
    }),
  });

  if (!response.ok || !response.body) {
    const detail = await response.text();
    writable.write(sseEvent('error', { traceId, message: `OpenAI Responses API error: ${response.status}`, detail }));
    writable.write(sseEvent('done', { traceId, ok: false }));
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const chunks = buffer.split('\n\n');
    buffer = chunks.pop() || '';
    for (const chunk of chunks) {
      const dataLine = chunk.split('\n').find((line) => line.startsWith('data: '));
      if (!dataLine) continue;
      const data = dataLine.slice(6);
      if (data === '[DONE]') continue;
      const event = JSON.parse(data);
      if (event.type === 'response.output_text.delta' && event.delta) {
        writable.write(sseEvent('model_delta', { traceId, delta: event.delta }));
      } else if (event.type === 'response.completed') {
        writable.write(sseEvent('model_completed', { traceId, usage: event.response?.usage || null }));
      } else if (event.type === 'response.error') {
        writable.write(sseEvent('error', { traceId, message: event.message || 'OpenAI stream error', event }));
      }
    }
  }
  writable.write(sseEvent('done', { traceId, ok: true, completedAt: new Date().toISOString() }));
}

export const agentsSdkPattern = `Current OpenAI Agents SDK JS equivalent:
import { Agent, run, tool } from '@openai/agents';
const agent = new Agent({ name: 'Launch Desk', model: process.env.OPENAI_MODEL || 'gpt-5.4-mini', instructions, tools });
const stream = await run(agent, input, { stream: true });
for await (const event of stream) { ...handle raw_model_stream_event and run_item_stream_event... }
await stream.completed;
`;
