const remoteAudio = document.querySelector('#remoteAudio');
const startButton = document.querySelector('#startButton');
const stopButton = document.querySelector('#stopButton');
const muteButton = document.querySelector('#muteButton');
const clearButton = document.querySelector('#clearButton');
const meterBar = document.querySelector('#meterBar');
const sessionState = document.querySelector('#sessionState');
const micState = document.querySelector('#micState');
const voiceState = document.querySelector('#voiceState');
const hint = document.querySelector('#hint');
const transcriptList = document.querySelector('#transcriptList');

let peerConnection;
let dataChannel;
let mediaStream;
let audioContext;
let analyser;
let meterAnimation;
let muted = false;
let assistantDraft = '';
const userDrafts = new Map();

function setState({session, mic, voice, message}) {
    if (session) sessionState.textContent = session;
    if (mic) micState.textContent = mic;
    if (voice) voiceState.textContent = voice;
    if (message) hint.textContent = message;
}

function addTranscript(role, text, draft = false) {
    const last = transcriptList.lastElementChild;
    const canUpdate = draft && last?.dataset.role === role && last?.dataset.draft === 'true';
    const item = canUpdate ? last : document.createElement('li');
    item.className = role;
    item.dataset.role = role;
    item.dataset.draft = String(draft);
    item.innerHTML = `<span class="who">${role === 'user' ? 'You' : 'World Room'}</span><span class="words"></span>`;
    item.querySelector('.words').textContent = text || '…';
    if (!canUpdate) transcriptList.append(item);
    transcriptList.scrollTop = transcriptList.scrollHeight;
    return item;
}

function startMeter(stream) {
    audioContext = new AudioContext();
    const source = audioContext.createMediaStreamSource(stream);
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 256;
    source.connect(analyser);
    const data = new Uint8Array(analyser.frequencyBinCount);

    const tick = () => {
        analyser.getByteFrequencyData(data);
        const average = data.reduce((sum, value) => sum + value, 0) / data.length;
        const width = muted ? 3 : Math.min(100, Math.max(3, average * 1.8));
        meterBar.style.width = `${width}%`;
        meterAnimation = requestAnimationFrame(tick);
    };
    tick();
}

function stopMeter() {
    if (meterAnimation) cancelAnimationFrame(meterAnimation);
    meterAnimation = undefined;
    meterBar.style.width = '3%';
    if (audioContext) audioContext.close();
    audioContext = undefined;
    analyser = undefined;
}

function sendEvent(event) {
    if (dataChannel?.readyState === 'open') dataChannel.send(JSON.stringify(event));
}

function handleServerEvent(event) {
    switch (event.type) {
        case 'session.created':
        case 'session.updated':
            setState({
                session: 'Live',
                voice: 'Listening',
                message: 'World Room is live. Speak naturally; semantic VAD handles turn-taking and interruptions.',
            });
            break;
        case 'input_audio_buffer.speech_started':
            document.body.classList.add('speaking');
            setState({mic: muted ? 'Muted' : 'Hearing you', voice: 'Yielding'});
            break;
        case 'input_audio_buffer.speech_stopped':
            document.body.classList.remove('speaking');
            setState({mic: muted ? 'Muted' : 'Processing', voice: 'Thinking'});
            break;
        case 'conversation.item.input_audio_transcription.delta': {
            const current = userDrafts.get(event.item_id) || '';
            const next = current + (event.delta || '');
            userDrafts.set(event.item_id, next);
            addTranscript('user', next, true);
            break;
        }
        case 'conversation.item.input_audio_transcription.completed':
            userDrafts.delete(event.item_id);
            addTranscript('user', event.transcript || '(audio turn)', false);
            break;
        case 'response.audio_transcript.delta':
        case 'response.output_audio_transcript.delta':
            assistantDraft += event.delta || '';
            addTranscript('assistant', assistantDraft, true);
            setState({voice: 'Speaking'});
            break;
        case 'response.audio_transcript.done':
        case 'response.output_audio_transcript.done':
            if (assistantDraft) addTranscript('assistant', assistantDraft, false);
            assistantDraft = '';
            setState({mic: muted ? 'Muted' : 'Listening', voice: 'Listening'});
            break;
        case 'response.done':
            document.body.classList.remove('speaking');
            setState({mic: muted ? 'Muted' : 'Listening', voice: 'Listening'});
            break;
        case 'error':
            setState({
                session: 'Error',
                voice: 'Recover',
                message: event.error?.message || 'Realtime event error. End and restart the session if audio stops.',
            });
            break;
        default:
            break;
    }
}

function configureDataChannel(channel) {
    dataChannel = channel;
    dataChannel.addEventListener('open', () => {
        document.body.classList.add('connected');
        setState({
            session: 'Live',
            mic: 'Listening',
            voice: 'Greeting',
            message: 'Connected. The companion will greet you; interrupt naturally whenever you have a better idea.',
        });
        sendEvent({type: 'response.create'});
    });
    dataChannel.addEventListener('message', message => {
        try {
            handleServerEvent(JSON.parse(message.data));
        } catch (error) {
            console.warn('Could not parse Realtime event', error);
        }
    });
    dataChannel.addEventListener('close', () => setState({session: 'Closed', voice: 'Waiting'}));
    dataChannel.addEventListener('error', () => setState({session: 'Error', message: 'Data channel failed. End and restart the session.'}));
}

async function startSession() {
    startButton.disabled = true;
    setState({
        session: 'Connecting',
        mic: 'Requesting',
        voice: 'Warming up',
        message: 'Requesting microphone access and creating a WebRTC offer…',
    });

    try {
        peerConnection = new RTCPeerConnection();
        peerConnection.addEventListener('connectionstatechange', () => {
            const state = peerConnection.connectionState;
            if (state === 'connected') setState({session: 'Live'});
            if (state === 'disconnected' || state === 'failed')
                setState({
                    session: 'Recovering',
                    message: 'Connection changed. If it does not recover quickly, end and restart the session.',
                });
            if (state === 'closed') setState({session: 'Closed'});
        });
        peerConnection.addEventListener('track', event => {
            remoteAudio.srcObject = event.streams[0];
        });

        mediaStream = await navigator.mediaDevices.getUserMedia({
            audio: {echoCancellation: true, noiseSuppression: true, autoGainControl: true},
        });
        mediaStream.getAudioTracks().forEach(track => peerConnection.addTrack(track, mediaStream));
        startMeter(mediaStream);
        configureDataChannel(peerConnection.createDataChannel('oai-events'));

        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);

        const response = await fetch('/session', {
            method: 'POST',
            headers: {'Content-Type': 'application/sdp'},
            body: offer.sdp,
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(errorText || `Session request failed with ${response.status}`);
        }

        await peerConnection.setRemoteDescription({type: 'answer', sdp: await response.text()});
        stopButton.disabled = false;
        muteButton.disabled = false;
    } catch (error) {
        console.error(error);
        cleanupSession(false);
        setState({
            session: 'Error',
            mic: 'Off',
            voice: 'Waiting',
            message: error instanceof Error ? error.message : 'Unable to start World Room.',
        });
    }
}

function cleanupSession(resetUi = true) {
    dataChannel?.close();
    peerConnection?.close();
    mediaStream?.getTracks().forEach(track => track.stop());
    stopMeter();
    peerConnection = undefined;
    dataChannel = undefined;
    mediaStream = undefined;
    muted = false;
    document.body.classList.remove('connected', 'speaking');
    startButton.disabled = false;
    stopButton.disabled = true;
    muteButton.disabled = true;
    muteButton.textContent = 'Mute mic';
    if (resetUi) setState({session: 'Idle', mic: 'Off', voice: 'Waiting', message: 'Session ended. Start a new room when you are ready.'});
}

function stopSession() {
    cleanupSession(true);
}

function toggleMute() {
    muted = !muted;
    mediaStream?.getAudioTracks().forEach(track => {
        track.enabled = !muted;
    });
    muteButton.textContent = muted ? 'Unmute mic' : 'Mute mic';
    setState({mic: muted ? 'Muted' : 'Listening'});
}

function sendSpark(text) {
    addTranscript('user', text, false);
    sendEvent({
        type: 'conversation.item.create',
        item: {
            type: 'message',
            role: 'user',
            content: [{type: 'input_text', text}],
        },
    });
    sendEvent({type: 'response.create'});
}

startButton.addEventListener('click', startSession);
stopButton.addEventListener('click', stopSession);
muteButton.addEventListener('click', toggleMute);
clearButton.addEventListener('click', () => {
    transcriptList.replaceChildren();
});

document.querySelectorAll('[data-spark]').forEach(button => {
    button.addEventListener('click', () => {
        if (!dataChannel || dataChannel.readyState !== 'open') {
            setState({message: 'Start a session first, then launch a spark into the room.'});
            return;
        }
        sendSpark(button.dataset.spark);
    });
});

window.addEventListener('beforeunload', stopSession);
