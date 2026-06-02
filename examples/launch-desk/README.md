# Launch Desk

Launch Desk is a polished frontend + streamed API route for turning a rough launch idea into an actionable engineering release plan. It collects a product brief, audience, launch date, constraints, and available assets, then streams tool progress and model output back to the UI.

## OpenAI API and Agents SDK guidance used

The implementation follows current OpenAI guidance verified on June 2, 2026:

- The OpenAI model docs recommend the GPT-5.5 family for complex reasoning and GPT-5.4 mini/nano variants for lower-latency and lower-cost workloads. Launch Desk defaults to `gpt-5.4-mini` for local development cost/latency and supports `OPENAI_MODEL=gpt-5.5` for highest-quality plans.
- The Agents SDK streaming guide shows `run(agent, input, { stream: true })`, `for await ... of stream`, raw model stream events, and run item events such as `tool_called` / `tool_output`.
- The local environment used to create this example blocked npm/GitHub package downloads with `403 Forbidden`, so the runnable server uses a small Responses API streaming adapter while keeping the project structured around the equivalent Agents SDK concepts. `package.json` declares `@openai/agents: latest`; after dependency installation is available, `src/agent/launchDeskAgent.mjs` can be swapped to the SDK pattern noted in `agentsSdkPattern` without changing the UI or tool modules.

This app does **not** use the deprecated Assistants API or legacy Chat Completions scaffolding.

## Project structure

```text
examples/launch-desk/
├── index.html                  # Frontend entry
├── package.json                # Local scripts and @openai/agents dependency declaration
├── src/
│   ├── agent/
│   │   └── launchDeskAgent.mjs # Agent instructions, prompt assembly, stream adapter, tracing metadata
│   ├── server/
│   │   └── dev-server.mjs      # Static frontend server and /api/launch-plan SSE route
│   ├── tests/
│   │   ├── tools.test.js       # Unit tests for tool outputs
│   │   └── verify-stream.mjs   # End-to-end streamed POST verifier
│   ├── tools/
│   │   └── launchTools.mjs     # Launch task extraction, readiness rubric, checklists, launch copy
│   └── ui/
│       ├── main.js             # Browser UI and SSE parsing
│       └── styles.css          # Polished responsive interface
└── validation-checklist.md
```

## Environment setup

Create a local env file or export variables before starting the server:

```bash
export OPENAI_API_KEY="sk-your-key"
export OPENAI_MODEL="gpt-5.4-mini" # optional; use gpt-5.5 for highest-quality plans
```

The key must be visible to the **server process**. A browser-only key is not used and should not be exposed.

## Install and run

From the repository root:

```bash
# If package installation is available in your environment
npm install --prefix examples/launch-desk

# Start the frontend and backend together
OPENAI_API_KEY="$OPENAI_API_KEY" npm run --prefix examples/launch-desk dev
```

Open <http://localhost:5178>. The same Node process serves the frontend and `/api/launch-plan`, which avoids assuming a separate frontend dev server can reach the OpenAI API.

## Verify the streamed agent endpoint

In a second terminal, while the dev server is running:

```bash
OPENAI_API_KEY="$OPENAI_API_KEY" npm run --prefix examples/launch-desk verify:stream
```

The verifier posts a real launch brief to `http://localhost:5178/api/launch-plan`, reads the SSE stream, and exits successfully only after receiving at least one `tool_progress` event and at least one `model_delta` event.

If it fails with `OPENAI_API_KEY is not set`, restart the server with the key exported in the same shell. If it fails with an OpenAI HTTP error, inspect the streamed `error` event for model access, quota, or network details.

## Extend with new tools or handoffs

1. Add a pure tool function to `src/tools/launchTools.mjs` and emit `tool_progress` before and after it runs.
2. Include the new output in `runLaunchDeskTools` and `buildAgentPrompt`.
3. Add a focused unit test in `src/tests/tools.test.js`.
4. When dependency installation is available, migrate the local tool functions to `tool({ name, description, parameters, execute })` from `@openai/agents` and stream `run_item_stream_event` plus `raw_model_stream_event` through the existing SSE event names.

## Observability hooks

Every `/api/launch-plan` request emits an initial `trace` SSE event containing:

- `traceId`
- `startedAt`
- model name
- transport name

The same `traceId` is attached to all tool, model, error, completion, and OpenAI `metadata` events so downstream logs can correlate a browser session with the OpenAI Responses run.
