# Campaign Concept Studio

A full-stack marketing concept studio that uses the current OpenAI Responses API to turn a short campaign brief into:

- a concise campaign concept
- three headline/body copy variants
- a launch checklist
- image prompts
- generated campaign key visuals

The demo is intentionally dependency-light: a Node HTTP server serves a polished static frontend and owns all OpenAI calls.

## OpenAI API guidance used

This implementation was checked against the latest OpenAI developer documentation on June 2, 2026:

- Text generation posts to `/v1/responses` and reads `response.output_text` when present, with an output-content fallback for REST responses.
- Image generation uses the Responses API image generation tool with `tools: [{ type: "image_generation" }]` and extracts `image_generation_call.result` base64 image output.
- The default text model is `gpt-5.5`, aligned with the current model guidance for a flagship model. You can switch to `gpt-5.4-mini` or another available model for lower latency/cost.

## Client/server boundary

`public/` contains browser-only UI code. It never calls OpenAI directly, never sees `OPENAI_API_KEY`, and only calls the local `POST /api/campaign` endpoint.

`server.mjs` is the server boundary. It validates the browser payload, calls OpenAI over the server-side `/v1/responses` API, and returns sanitized JSON plus base64 data URLs for generated images.

```text
Browser form -> POST /api/campaign -> Node server -> OpenAI Responses API
Browser UI <- JSON + image data URLs <- Node server <- OpenAI Responses API
```

## Install

```bash
cd examples/campaign-concept-studio
npm install
cp .env.example .env
```

Set your key in `.env`, or export it in your shell:

```bash
export OPENAI_API_KEY="sk-your-openai-api-key"
```

> Node does not load `.env` automatically in this minimal demo. Use `set -a; source .env; set +a` before `npm start`, install a dotenv runner, or configure environment variables in your hosting provider.

## Run locally

```bash
cd examples/campaign-concept-studio
set -a; source .env; set +a
npm start
```

Open <http://localhost:3000>.

For development with Node's watch mode:

```bash
npm run dev
```

## Environment variables

| Variable | Required | Default | Purpose |
| --- | --- | --- | --- |
| `OPENAI_API_KEY` | Yes | none | Server-side OpenAI project API key. |
| `PORT` | No | `3000` | HTTP server port. |
| `OPENAI_TEXT_MODEL` | No | `gpt-5.5` | Model used for structured campaign strategy/copy generation. |
| `OPENAI_IMAGE_TOOL_MODEL` | No | same as `OPENAI_TEXT_MODEL` | Responses model used with the image generation tool. |
| `OPENAI_IMAGE_MODEL` | No | `gpt-image-2` | GPT Image model selected inside the Responses image-generation tool. |
| `CAMPAIGN_IMAGE_COUNT` | No | `2` | Number of image prompts to render, clamped from 1 to 3. |

## Where to adjust models, prompts, and image settings

- **Text model:** update `textModel` in `server.mjs` via the `OPENAI_TEXT_MODEL` environment variable.
- **Image-tool response model:** update `imageToolModel` in `server.mjs` via `OPENAI_IMAGE_TOOL_MODEL`.
- **Image generation model:** update `imageModel` in `server.mjs` via `OPENAI_IMAGE_MODEL`.
- **Creative director system behavior:** edit the `instructions` string inside `createCampaignPlan()`.
- **Campaign planning prompt:** edit `buildCampaignPrompt()`.
- **Structured output shape:** edit `campaignSchema` if your team needs more fields, such as budgets, media weights, or claims substantiation.
- **Image direction prompt:** edit `createCampaignImage()` to add brand rules, photographic style, aspect-ratio needs, or restrictions.
- **Image settings:** adjust the `image_generation` tool object in `createCampaignImage()` for `size`, `quality`, and related supported output options.

## Validation plan

1. **Static server check:** run `npm run check` to validate `server.mjs` syntax.
2. **Missing key behavior:** start without `OPENAI_API_KEY`, submit the sample brief, and verify the UI shows the server configuration error without exposing secrets.
3. **Input validation:** submit an empty form or remove channels and verify the API returns a `400` with a helpful message.
4. **Happy path:** set `OPENAI_API_KEY`, submit the sample brief, and verify the response includes concept, three copy variants, checklist items, strategy notes, image prompts, and generated visuals.
5. **Boundary review:** search the `public/` folder for `OPENAI_API_KEY` and `openai` imports; there should be none.
6. **Deployment smoke test:** deploy with server environment variables configured, load the page over HTTPS, and submit a brief from an incognito browser session.

## Deployment notes

This app is a small Node server and can be deployed to any host that supports Node 20+ and long-running HTTP services, including Render, Fly.io, Railway, a VM, or a container platform.

Production recommendations:

- Store `OPENAI_API_KEY` as a secret environment variable in the hosting provider.
- Put the app behind HTTPS.
- Add authentication if campaign briefs are confidential.
- Add rate limiting and request logging before broad internal rollout.
- Consider storing generations in your own database/object storage if users need history; this demo keeps no server-side state.
- Monitor OpenAI usage because image generation has higher latency and cost than text-only requests.

## Troubleshooting

- **`OPENAI_API_KEY is not configured`**: export the key in the server process environment and restart.
- **Image generation access errors**: confirm your OpenAI organization/project has access to GPT Image models and any required organization verification is complete.
- **Slow responses**: lower `CAMPAIGN_IMAGE_COUNT`, choose a smaller text model, or lower image `quality`.
