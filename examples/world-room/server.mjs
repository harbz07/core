import {createHash} from 'node:crypto';
import {createReadStream, existsSync} from 'node:fs';
import {extname, join, normalize} from 'node:path';
import {createServer} from 'node:http';
import {fileURLToPath} from 'node:url';

const root = fileURLToPath(new URL('./public/', import.meta.url));
const port = Number(process.env.PORT || 3000);
const model = process.env.OPENAI_REALTIME_MODEL || 'gpt-realtime-2';
const voice = process.env.OPENAI_REALTIME_VOICE || 'marin';
const apiKey = process.env.OPENAI_API_KEY;

const worldRoomInstructions = `
You are World Room, a live worldbuilding companion for tabletop storytellers, writers, and game makers.
Your style is playful, vivid, collaborative, and quick. Speak in short energetic turns that invite the user to add details.
Prioritize invention over explanation. Help create settings, factions, characters, conflicts, rituals, artifacts, mysteries, and scene hooks.
When the user hesitates, offer two or three evocative choices. When they add an idea, weave it into continuity and raise the stakes.
Use sensory detail and names. Do not monologue: keep most replies under 25 seconds unless asked for a longer pitch.
If the user interrupts, gracefully pivot and treat the interruption as the new creative direction.
Begin by welcoming them to World Room and asking what kind of world, genre, mood, or spark they want to build today.
`.trim();

const sessionConfig = {
    type: 'realtime',
    model,
    output_modalities: ['audio'],
    instructions: worldRoomInstructions,
    audio: {
        input: {
            format: {type: 'audio/pcm', rate: 24000},
            noise_reduction: {type: 'near_field'},
            transcription: {
                model: 'gpt-4o-transcribe',
                language: 'en',
                prompt: 'Worldbuilding and storytelling conversation: settings, characters, factions, conflicts, lore, scenes.',
            },
            turn_detection: {
                type: 'semantic_vad',
                eagerness: 'medium',
                interrupt_response: true,
                create_response: true,
            },
        },
        output: {
            format: {type: 'audio/pcm'},
            voice,
        },
    },
};

const mimeTypes = new Map([
    ['.html', 'text/html; charset=utf-8'],
    ['.js', 'text/javascript; charset=utf-8'],
    ['.css', 'text/css; charset=utf-8'],
    ['.json', 'application/json; charset=utf-8'],
    ['.svg', 'image/svg+xml'],
]);

function sendJson(res, status, payload) {
    const body = JSON.stringify(payload);
    res.writeHead(status, {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Length': Buffer.byteLength(body),
    });
    res.end(body);
}

async function readBody(req) {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    return Buffer.concat(chunks).toString('utf8');
}

function safetyIdentifier(req) {
    const forwarded = req.headers['x-forwarded-for'];
    const ip = Array.isArray(forwarded) ? forwarded[0] : forwarded || req.socket.remoteAddress || 'local';
    return createHash('sha256').update(`world-room:${ip}`).digest('hex');
}

async function createRealtimeCall(req, res) {
    if (!apiKey) {
        sendJson(res, 500, {
            error: 'OPENAI_API_KEY is not set. Export it in your shell before starting World Room.',
        });
        return;
    }

    const offer = await readBody(req);
    if (!offer.includes('v=0')) {
        sendJson(res, 400, {error: 'Expected an SDP offer in the request body.'});
        return;
    }

    const form = new FormData();
    form.set('sdp', offer);
    form.set('session', JSON.stringify(sessionConfig));

    const upstream = await fetch('https://api.openai.com/v1/realtime/calls', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${apiKey}`,
            'OpenAI-Safety-Identifier': safetyIdentifier(req),
        },
        body: form,
    });

    const text = await upstream.text();
    if (!upstream.ok) {
        res.writeHead(upstream.status, {'Content-Type': 'application/json; charset=utf-8'});
        res.end(text || JSON.stringify({error: 'OpenAI Realtime session creation failed.'}));
        return;
    }

    res.writeHead(200, {'Content-Type': 'application/sdp'});
    res.end(text);
}

async function serveStatic(req, res) {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    const requested = url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname);
    const normalized = normalize(requested).replace(/^([.][.][/\\])+/, '');
    const filePath = join(root, normalized);

    if (!filePath.startsWith(root) || !existsSync(filePath)) {
        sendJson(res, 404, {error: 'Not found'});
        return;
    }

    res.writeHead(200, {
        'Content-Type': mimeTypes.get(extname(filePath)) || 'application/octet-stream',
        'Cache-Control': 'no-store',
    });
    createReadStream(filePath).pipe(res);
}

const server = createServer(async (req, res) => {
    try {
        if (req.method === 'GET' && req.url === '/health') {
            sendJson(res, 200, {ok: true, model, voice, hasApiKey: Boolean(apiKey)});
            return;
        }

        if (req.method === 'GET' && req.url === '/config') {
            sendJson(res, 200, {model, voice});
            return;
        }

        if (req.method === 'POST' && req.url === '/session') {
            await createRealtimeCall(req, res);
            return;
        }

        if (req.method === 'GET' || req.method === 'HEAD') {
            await serveStatic(req, res);
            return;
        }

        sendJson(res, 405, {error: 'Method not allowed'});
    } catch (error) {
        console.error(error);
        sendJson(res, 500, {error: error instanceof Error ? error.message : 'Unexpected server error'});
    }
});

server.listen(port, () => {
    console.log(`World Room is listening on http://localhost:${port}`);
    console.log(`Realtime model: ${model}; voice: ${voice}`);
    if (!apiKey) console.warn('OPENAI_API_KEY is not set; /session will return an error until you export it.');
});
