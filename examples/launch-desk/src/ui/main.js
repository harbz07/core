import './styles.css';

const app = document.querySelector('#app');

app.innerHTML = `
  <section class="shell">
    <aside class="hero">
      <div class="eyebrow">OpenAI agent workspace</div>
      <h1>Launch Desk</h1>
      <p>Turn a rough product idea into a release plan with risks, owners, launch copy, and the questions your team still needs to answer.</p>
      <div class="signal-grid">
        <span>Progressive streaming</span>
        <span>Readiness rubric</span>
        <span>Owner checklists</span>
        <span>Trace events</span>
      </div>
    </aside>

    <section class="panel form-panel">
      <form id="launch-form">
        <label>Product brief<textarea name="productBrief" required rows="7" placeholder="What are you launching, why now, what customer problem does it solve, and what is in scope?"></textarea></label>
        <div class="two-col">
          <label>Audience<input name="audience" placeholder="e.g. Admins at mid-market SaaS companies" /></label>
          <label>Launch date<input name="launchDate" type="date" /></label>
        </div>
        <label>Constraints<textarea name="constraints" rows="4" placeholder="Dependencies, compliance, regions, beta limits, staffing, freezes..."></textarea></label>
        <label>Available assets<textarea name="assets" rows="4" placeholder="Docs, screenshots, demo video, FAQ, migration guide, sales deck..."></textarea></label>
        <button type="submit">Build release plan</button>
      </form>
    </section>

    <section class="panel output-panel">
      <div class="output-head">
        <div>
          <p class="eyebrow">Agent stream</p>
          <h2>Plan output</h2>
        </div>
        <span id="status" class="status">Idle</span>
      </div>
      <div id="events" class="events"></div>
      <article id="answer" class="answer empty">Submit a brief to see progressive tool events and model text.</article>
    </section>
  </section>
`;

const form = document.querySelector('#launch-form');
const status = document.querySelector('#status');
const events = document.querySelector('#events');
const answer = document.querySelector('#answer');

function appendEvent(type, payload) {
  const node = document.createElement('div');
  node.className = `event ${type}`;
  const label = type === 'tool_progress' ? `${payload.tool}: ${payload.status}` : type;
  node.innerHTML = `<strong>${label}</strong><span>${payload.message || payload.traceId || ''}</span>`;
  events.prepend(node);
}

function renderMarkdownLite(text) {
  return text
    .replace(/^### (.*)$/gm, '<h3>$1</h3>')
    .replace(/^## (.*)$/gm, '<h2>$1</h2>')
    .replace(/^# (.*)$/gm, '<h1>$1</h1>')
    .replace(/^\* (.*)$/gm, '<li>$1</li>')
    .replace(/(<li>.*<\/li>)/gs, '<ul>$1</ul>')
    .replace(/\n/g, '<br />');
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const payload = Object.fromEntries(new FormData(form).entries());
  status.textContent = 'Running';
  status.className = 'status running';
  events.innerHTML = '';
  answer.className = 'answer';
  answer.textContent = '';
  let text = '';

  const response = await fetch('/api/launch-plan', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

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
      const eventType = chunk.split('\n').find((line) => line.startsWith('event: '))?.slice(7);
      const dataLine = chunk.split('\n').find((line) => line.startsWith('data: '));
      if (!eventType || !dataLine) continue;
      const payload = JSON.parse(dataLine.slice(6));
      if (eventType === 'model_delta') {
        text += payload.delta;
        answer.innerHTML = renderMarkdownLite(text);
      } else if (eventType === 'done') {
        status.textContent = payload.ok ? 'Complete' : 'Blocked';
        status.className = payload.ok ? 'status complete' : 'status blocked';
      } else if (eventType === 'error') {
        appendEvent(eventType, payload);
        status.textContent = 'Error';
        status.className = 'status blocked';
      } else {
        appendEvent(eventType, payload);
      }
    }
  }
});
