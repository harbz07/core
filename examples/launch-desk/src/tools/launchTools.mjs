const CHANNELS = ['email', 'in-app', 'blog', 'social', 'sales enablement'];

const REQUIRED_DETAILS = [
  ['productBrief', 'What is launching and what customer problem does it solve?'],
  ['audience', 'Who is the primary audience and buyer/user segment?'],
  ['launchDate', 'What launch date or date range should the plan optimize for?'],
];

export function normalizeLaunchInput(raw = {}) {
  return {
    productBrief: String(raw.productBrief || '').trim(),
    audience: String(raw.audience || '').trim(),
    launchDate: String(raw.launchDate || '').trim(),
    constraints: String(raw.constraints || '').trim(),
    assets: String(raw.assets || '').trim(),
  };
}

export function findMissingDetails(input) {
  return REQUIRED_DETAILS.filter(([key]) => !input[key]).map(([key, question]) => ({ key, question }));
}

export function extractTasksFromBrief(input) {
  const text = `${input.productBrief} ${input.constraints} ${input.assets}`.toLowerCase();
  const taskMap = [
    ['Define launch narrative and one-line positioning', 'Product Marketing', 'P0'],
    ['Confirm release scope, dependencies, and ship criteria', 'Engineering', 'P0'],
    ['Prepare customer-facing docs and support macros', 'Docs + Support', 'P1'],
    ['Create launch analytics dashboard and success metrics', 'Data / Product', 'P1'],
    ['Schedule stakeholder review and launch-readiness meeting', 'Launch Owner', 'P0'],
  ];

  if (text.includes('beta') || text.includes('limited')) {
    taskMap.push(['Segment beta cohort and define feedback loop', 'Product', 'P0']);
  }
  if (text.includes('compliance') || text.includes('legal') || text.includes('security')) {
    taskMap.push(['Complete legal, compliance, and security review', 'Legal / Security', 'P0']);
  }
  if (text.includes('api') || text.includes('developer')) {
    taskMap.push(['Publish API docs, examples, and migration notes', 'Developer Experience', 'P1']);
  }

  return taskMap.map(([task, owner, priority], index) => ({ id: `T${index + 1}`, task, owner, priority }));
}

export function checkLaunchReadiness(input, tasks) {
  const missing = findMissingDetails(input);
  const rubric = [
    { area: 'Customer value', pass: input.productBrief.length > 80, recommendation: 'Sharpen problem, benefit, and differentiator.' },
    { area: 'Audience clarity', pass: input.audience.length > 20, recommendation: 'Name primary segment, buyer, and excluded audiences.' },
    { area: 'Timing', pass: Boolean(input.launchDate), recommendation: 'Add target launch date and freeze/review milestones.' },
    { area: 'Risk ownership', pass: tasks.some((task) => task.priority === 'P0'), recommendation: 'Assign owners to P0 launch blockers.' },
    { area: 'Asset readiness', pass: input.assets.length > 20, recommendation: 'List docs, screenshots, demo, FAQ, and comms assets.' },
  ];

  const score = Math.round((rubric.filter((item) => item.pass).length / rubric.length) * 100);
  const risks = [
    { risk: 'Scope churn close to launch', severity: 'High', mitigation: 'Lock launch scope and publish explicit cut criteria.' },
    { risk: 'Ambiguous customer promise', severity: input.productBrief.length > 80 ? 'Medium' : 'High', mitigation: 'Validate positioning with PMM, Sales, and Support.' },
    { risk: 'Asset gaps delay enablement', severity: input.assets.length > 20 ? 'Medium' : 'High', mitigation: 'Create a content owner checklist with due dates.' },
  ];

  if (missing.length) {
    risks.unshift({ risk: 'Key launch inputs are missing', severity: 'High', mitigation: `Answer: ${missing.map((item) => item.question).join(' ')}` });
  }

  return { score, rubric, risks };
}

export function generateOwnerChecklist(tasks, input) {
  const grouped = new Map();
  for (const task of tasks) {
    if (!grouped.has(task.owner)) grouped.set(task.owner, []);
    grouped.get(task.owner).push(task);
  }

  return Array.from(grouped.entries()).map(([owner, ownerTasks]) => ({
    owner,
    dueBy: input.launchDate || 'Set after launch date is confirmed',
    items: ownerTasks.map((task) => `${task.priority}: ${task.task}`),
  }));
}

export function draftChannelCopy(input) {
  const product = input.productBrief.split(/[.!?]/)[0].slice(0, 140) || 'A new product update';
  const audience = input.audience || 'your team';
  return CHANNELS.map((channel) => ({
    channel,
    draft: channel === 'social'
      ? `New: ${product}. Built for ${audience}. Reply if you want the launch notes.`
      : channel === 'email'
        ? `Subject: Introducing ${product}\n\nWe are preparing a launch for ${audience}. This update focuses on a clearer path from problem to release impact, with rollout details and support resources included.`
        : `${product} — tailored for ${audience}. Include benefit, proof, rollout date, and next action for this ${channel} touchpoint.`,
  }));
}

export async function runLaunchDeskTools(input, onProgress = () => {}) {
  const normalized = normalizeLaunchInput(input);
  onProgress({ tool: 'extract_tasks_from_brief', status: 'running', message: 'Extracting launch workstreams from the brief.' });
  const tasks = extractTasksFromBrief(normalized);
  onProgress({ tool: 'extract_tasks_from_brief', status: 'completed', output: tasks });

  onProgress({ tool: 'check_launch_readiness', status: 'running', message: 'Scoring launch readiness against the rubric.' });
  const readiness = checkLaunchReadiness(normalized, tasks);
  onProgress({ tool: 'check_launch_readiness', status: 'completed', output: readiness });

  onProgress({ tool: 'generate_owner_checklist', status: 'running', message: 'Grouping tasks into owner checklists.' });
  const checklists = generateOwnerChecklist(tasks, normalized);
  onProgress({ tool: 'generate_owner_checklist', status: 'completed', output: checklists });

  onProgress({ tool: 'draft_channel_copy', status: 'running', message: 'Drafting channel-specific launch copy seeds.' });
  const copy = draftChannelCopy(normalized);
  onProgress({ tool: 'draft_channel_copy', status: 'completed', output: copy });

  return { input: normalized, missingDetails: findMissingDetails(normalized), tasks, readiness, checklists, copy };
}
