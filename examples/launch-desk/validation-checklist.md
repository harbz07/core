# Launch Desk validation checklist

Use this checklist before extending or demoing Launch Desk.

## Agent behavior

- [ ] Given a rough but complete brief, the response includes a prioritized P0/P1/P2 release plan.
- [ ] The plan contains a risk register with severity, owner/team, and mitigation.
- [ ] The response groups work into an owner checklist rather than a single undifferentiated task list.
- [ ] The response drafts launch copy for email, in-app, blog, social, and sales enablement.
- [ ] If product brief, audience, or launch date is missing, follow-up questions appear near the top while still providing a provisional plan.

## Frontend flow

- [ ] The page at `/` renders the Launch Desk form and output panel.
- [ ] Submitting the form disables ambiguity by showing `Running`, then progressively displays trace/tool events.
- [ ] Model deltas append to the answer panel as they arrive rather than waiting for full completion.
- [ ] Errors from the API route are visible in the event feed and change the status pill to `Error` or `Blocked`.
- [ ] The layout remains usable on desktop and mobile widths.

## Tool outputs

- [ ] `extract_tasks_from_brief` emits P0 launch-management and engineering-readiness tasks.
- [ ] Developer/API briefs add API documentation or migration tasks.
- [ ] Security/legal/compliance constraints add a P0 review task.
- [ ] `check_launch_readiness` returns a score, rubric, and risk register.
- [ ] `generate_owner_checklist` groups tasks by owner with due-date context.
- [ ] `draft_channel_copy` returns five channel-specific drafts.

## End-to-end streaming

- [ ] Start the dev server with `OPENAI_API_KEY` exported in the same process environment.
- [ ] Run `npm run --prefix examples/launch-desk verify:stream`.
- [ ] Confirm the verifier reports `sawToolProgress: true`.
- [ ] Confirm the verifier reports `sawModelDelta: true`.
- [ ] If verification fails, capture the streamed `error` details before checking unrelated health or type tests.
