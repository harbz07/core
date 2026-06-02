# World Room

World Room is a creative realtime audio app for inventing fictional worlds with a live voice companion. It uses the current OpenAI Realtime API WebRTC flow so the browser streams microphone audio and receives model audio with low-latency turn-taking, while the local server keeps your `OPENAI_API_KEY` off the client.

## Why this Realtime shape?

OpenAI's current WebRTC guidance recommends WebRTC for browser-to-Realtime connections because it provides more consistent performance for client voice applications than WebSockets. The browser creates a peer connection, captures microphone audio with `getUserMedia`, opens an `oai-events` data channel for Realtime events, and sends an SDP offer to a trusted app server. The server attaches the session configuration and calls `POST https://api.openai.com/v1/realtime/calls`, returning the SDP answer to the browser.

The demo defaults to `gpt-realtime-2`, which the OpenAI model docs describe as a realtime voice model with text/audio input and text/audio output. Set `OPENAI_REALTIME_MODEL` if you need to test a different Realtime-compatible model.

## Responsibilities

### Browser/client

- Requests microphone permission and owns the local `MediaStream` lifecycle.
- Creates an `RTCPeerConnection` and attaches microphone audio tracks.
- Plays remote model audio from the WebRTC `track` event.
- Opens the `oai-events` data channel for session events, transcripts, prompts, errors, and recovery state.
- Displays obvious session, microphone, and companion states.
- Never sees the long-lived `OPENAI_API_KEY`.

### Server/session bootstrap

- Reads `OPENAI_API_KEY` from the local environment.
- Owns the Realtime session configuration: model, voice, instructions, audio formats, transcription, and VAD.
- Receives the browser SDP offer at `POST /session`.
- Calls OpenAI `POST /v1/realtime/calls` with the SDP offer and session config.
- Returns only the SDP answer to the browser.
- Adds an `OpenAI-Safety-Identifier` header using a privacy-preserving hash of the caller IP for local testing.

## Local setup

From the repository root:

```bash
export OPENAI_API_KEY="sk-..."
# Optional overrides:
export OPENAI_REALTIME_MODEL="gpt-realtime-2"
export OPENAI_REALTIME_VOICE="marin"
export PORT=3000

node examples/world-room/server.mjs
```

Then open <http://localhost:3000> in a browser that supports WebRTC microphone capture.

## Using the room

1. Click **Enter World Room**.
2. Allow microphone access.
3. Wait for the session state to show **Live**.
4. Speak a worldbuilding spark, such as "a desert empire where shadows are contraband."
5. Interrupt naturally if the companion starts going in the wrong direction.
6. Use **Mute mic** when you want to listen without sending audio.
7. Use **End session** to close tracks, the data channel, and the peer connection.

## Developer notes

### Latency

- Prefer WebRTC in browser clients; it avoids manually base64-encoding audio chunks and lets the browser handle media transport.
- Keep the prompt direct and short enough that the model can answer in compact spoken turns.
- World Room uses semantic VAD with interruption enabled so user speech can stop long assistant responses.
- The UI asks the browser for echo cancellation, noise suppression, and auto gain control. These reduce feedback loops, especially when using speakers.
- Input transcription is asynchronous and should be treated as a helpful transcript, not the exact audio context the model used.

### Session lifecycle

- Start creates a fresh peer connection, microphone stream, data channel, and `/session` SDP exchange.
- The server configuration chooses the model and voice before the session starts. Voice should be selected before the first audio response.
- A Realtime session has a maximum duration; for long creative workshops, end and start a fresh room periodically.
- End session closes the data channel, peer connection, audio tracks, and microphone meter.

### Permissions

- Browsers generally require microphone capture from `localhost` or HTTPS origins.
- If permission is denied, the client surfaces the error and keeps the session idle.
- The API key belongs on the server only. Do not copy it into `public/app.js` or browser storage.

### Error recovery

- If `/session` returns an API-key or OpenAI error, confirm `OPENAI_API_KEY`, model access, and account limits.
- If WebRTC enters `failed` or `disconnected`, use **End session** and start again.
- If audio output is silent, verify the page is not muted, the browser allowed autoplay after the user gesture, and the selected output device is correct.
- If transcripts lag, keep using voice; Realtime conversation audio does not depend on transcript text being complete.

## Validation checklist

- [ ] Start with no `OPENAI_API_KEY`; `/session` should fail clearly without exposing any key.
- [ ] Start with a valid `OPENAI_API_KEY`; session state should move from **Connecting** to **Live**.
- [ ] Deny microphone permission; the UI should show an error and leave controls recoverable.
- [ ] Allow microphone permission; the mic meter should move when speaking.
- [ ] Confirm the companion greets you through audio and the remote audio element plays.
- [ ] Speak a worldbuilding request; the transcript should show user text when transcription completes.
- [ ] Interrupt the companion mid-response; it should stop or pivot naturally.
- [ ] Click a spark button during a live session; it should inject a text prompt over the data channel and trigger an audio response.
- [ ] Toggle **Mute mic**; the meter should drop and the microphone state should show **Muted**.
- [ ] End and restart a session; tracks and the data channel should cleanly recreate.
- [ ] Temporarily stop the server or network; the UI should report a recoverable connection/session error.
