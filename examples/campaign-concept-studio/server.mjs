import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {extname, join, normalize} from 'node:path';
import {fileURLToPath} from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const publicDir = join(__dirname, 'public');
const port = Number.parseInt(process.env.PORT || '3000', 10);
const textModel = process.env.OPENAI_TEXT_MODEL || 'gpt-5.5';
const imageToolModel = process.env.OPENAI_IMAGE_TOOL_MODEL || textModel;
const imageModel = process.env.OPENAI_IMAGE_MODEL || 'gpt-image-2';
const imageCount = Math.min(Math.max(Number.parseInt(process.env.CAMPAIGN_IMAGE_COUNT || '2', 10), 1), 3);

const mimeTypes = new Map([
    ['.html', 'text/html; charset=utf-8'],
    ['.css', 'text/css; charset=utf-8'],
    ['.js', 'text/javascript; charset=utf-8'],
    ['.json', 'application/json; charset=utf-8'],
    ['.svg', 'image/svg+xml'],
    ['.png', 'image/png'],
]);

const campaignSchema = {
    type: 'object',
    additionalProperties: false,
    required: ['concept', 'copyVariants', 'launchChecklist', 'imagePrompts', 'strategyNotes'],
    properties: {
        concept: {
            type: 'object',
            additionalProperties: false,
            required: ['name', 'summary', 'coreMessage', 'rationale'],
            properties: {
                name: {type: 'string'},
                summary: {type: 'string'},
                coreMessage: {type: 'string'},
                rationale: {type: 'string'},
            },
        },
        copyVariants: {
            type: 'array',
            minItems: 3,
            maxItems: 3,
            items: {
                type: 'object',
                additionalProperties: false,
                required: ['headline', 'body', 'channelFit'],
                properties: {
                    headline: {type: 'string'},
                    body: {type: 'string'},
                    channelFit: {type: 'string'},
                },
            },
        },
        launchChecklist: {
            type: 'array',
            minItems: 6,
            maxItems: 10,
            items: {type: 'string'},
        },
        imagePrompts: {
            type: 'array',
            minItems: 2,
            maxItems: 3,
            items: {
                type: 'object',
                additionalProperties: false,
                required: ['title', 'prompt'],
                properties: {
                    title: {type: 'string'},
                    prompt: {type: 'string'},
                },
            },
        },
        strategyNotes: {
            type: 'array',
            minItems: 3,
            maxItems: 5,
            items: {type: 'string'},
        },
    },
};

function sendJson(res, status, payload) {
    const body = JSON.stringify(payload);
    res.writeHead(status, {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store',
    });
    res.end(body);
}

function readRequestBody(req) {
    return new Promise((resolve, reject) => {
        let body = '';
        req.setEncoding('utf8');
        req.on('data', chunk => {
            body += chunk;
            if (body.length > 50_000) {
                reject(new Error('Request body is too large.'));
                req.destroy();
            }
        });
        req.on('end', () => resolve(body));
        req.on('error', reject);
    });
}

function cleanString(value, maxLength) {
    if (typeof value !== 'string') return '';
    return value.replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

function parseCampaignRequest(payload) {
    const campaign = {
        brief: cleanString(payload?.brief, 600),
        audience: cleanString(payload?.audience, 400),
        product: cleanString(payload?.product, 500),
        tone: cleanString(payload?.tone, 180),
        channels: Array.isArray(payload?.channels)
            ? payload.channels.map(item => cleanString(item, 80)).filter(Boolean).slice(0, 8)
            : [],
    };

    const missing = [];
    if (!campaign.brief) missing.push('campaign brief');
    if (!campaign.audience) missing.push('target audience');
    if (!campaign.product) missing.push('product details');
    if (!campaign.tone) missing.push('tone');
    if (!campaign.channels.length) missing.push('desired channels');

    return {campaign, missing};
}

function buildCampaignPrompt(campaign) {
    return `Create a launch-ready marketing campaign concept for this brief.\n\nCampaign brief: ${campaign.brief}\nTarget audience: ${campaign.audience}\nProduct details: ${campaign.product}\nTone: ${campaign.tone}\nDesired channels: ${campaign.channels.join(', ')}\n\nReturn a concise campaign concept, exactly three headline/body copy variants, a practical launch checklist, and image prompts that can be passed directly to an image-generation model. Keep copy specific, ownable, and safe for a brand review. Do not mention that AI generated the work.`;
}

async function createResponse(payload) {
    const response = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: {
            authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
            'content-type': 'application/json',
        },
        body: JSON.stringify(payload),
    });

    const data = await response.json();
    if (!response.ok) {
        const message = data?.error?.message || `OpenAI request failed with status ${response.status}`;
        throw new Error(message);
    }

    return data;
}

function extractOutputText(response) {
    if (typeof response.output_text === 'string') return response.output_text;

    return (response.output || [])
        .flatMap(output => (Array.isArray(output.content) ? output.content : []))
        .map(content => content.text || '')
        .join('')
        .trim();
}

async function createCampaignPlan(campaign) {
    const response = await createResponse({
        model: textModel,
        instructions:
            'You are a senior integrated marketing creative director. Return only valid JSON that matches the requested schema.',
        input: buildCampaignPrompt(campaign),
        text: {
            format: {
                type: 'json_schema',
                name: 'campaign_concept_studio_plan',
                strict: true,
                schema: campaignSchema,
            },
        },
    });

    return JSON.parse(extractOutputText(response));
}

async function createCampaignImage(imagePrompt, campaign) {
    const response = await createResponse({
        model: imageToolModel,
        input: `Generate one polished marketing key visual for this campaign direction.\n\nCampaign: ${campaign.brief}\nAudience: ${campaign.audience}\nChannels: ${campaign.channels.join(', ')}\nVisual direction: ${imagePrompt.prompt}\n\nUse a premium commercial art direction. Avoid logos, trademarks, tiny unreadable text, or UI mockups.`,
        tools: [
            {
                type: 'image_generation',
                action: 'generate',
                size: '1024x1024',
                model: imageModel,
                quality: 'medium',
            },
        ],
    });

    const imageCall = response.output.find(output => output.type === 'image_generation_call' && output.result);

    return {
        title: imagePrompt.title,
        prompt: imagePrompt.prompt,
        image: imageCall ? `data:image/png;base64,${imageCall.result}` : null,
    };
}

async function handleCampaign(req, res) {
    if (!process.env.OPENAI_API_KEY) {
        sendJson(res, 500, {
            error: 'OPENAI_API_KEY is not configured on the server. Copy .env.example, export the key, and restart the app.',
        });
        return;
    }

    try {
        const rawBody = await readRequestBody(req);
        const payload = JSON.parse(rawBody || '{}');
        const {campaign, missing} = parseCampaignRequest(payload);

        if (missing.length) {
            sendJson(res, 400, {error: `Please provide ${missing.join(', ')}.`});
            return;
        }

        const plan = await createCampaignPlan(campaign);
        const generatedImages = await Promise.all(
            plan.imagePrompts.slice(0, imageCount).map(prompt => createCampaignImage(prompt, campaign)),
        );

        sendJson(res, 200, {
            ...plan,
            generatedImages,
            meta: {
                textModel,
                imageToolModel,
                imageModel,
                imageCount: generatedImages.length,
                serverBoundary: 'OpenAI Responses API calls run only in server.mjs; the browser posts campaign inputs to /api/campaign and receives sanitized JSON plus base64 image data.',
            },
        });
    } catch (error) {
        console.error(error);
        sendJson(res, 500, {
            error: error instanceof SyntaxError ? 'Request JSON was invalid.' : 'Campaign generation failed. Check the server logs and OpenAI project access.',
        });
    }
}

async function serveStatic(req, res) {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    const requestedPath = url.pathname === '/' ? '/index.html' : url.pathname;
    const normalizedPath = normalize(decodeURIComponent(requestedPath)).replace(/^\.\.(\/|\\|$)/, '');
    const filePath = join(publicDir, normalizedPath);

    if (!filePath.startsWith(publicDir)) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
    }

    try {
        const file = await readFile(filePath);
        res.writeHead(200, {
            'content-type': mimeTypes.get(extname(filePath)) || 'application/octet-stream',
            'cache-control': requestedPath === '/index.html' ? 'no-store' : 'public, max-age=3600',
        });
        res.end(file);
    } catch {
        res.writeHead(404, {'content-type': 'text/plain; charset=utf-8'});
        res.end('Not found');
    }
}

const server = http.createServer((req, res) => {
    if (req.method === 'POST' && req.url === '/api/campaign') {
        void handleCampaign(req, res);
        return;
    }

    if (req.method === 'GET' || req.method === 'HEAD') {
        void serveStatic(req, res);
        return;
    }

    res.writeHead(405, {'allow': 'GET, HEAD, POST'});
    res.end('Method not allowed');
});

server.listen(port, () => {
    console.log(`Campaign Concept Studio running at http://localhost:${port}`);
});
