const form = document.querySelector('#campaign-form');
const generateButton = document.querySelector('#generate-button');
const sampleButton = document.querySelector('#sample-button');
const emptyState = document.querySelector('#empty-state');
const loadingState = document.querySelector('#loading-state');
const errorState = document.querySelector('#error-state');
const errorMessage = document.querySelector('#error-message');
const results = document.querySelector('#results');

const sampleBrief = {
    brief: 'Launch a modular standing-desk lamp that improves focus for hybrid workers during dark winter mornings.',
    audience:
        'Design-conscious remote and hybrid professionals, ages 27-45, who invest in ergonomic workspaces and productivity rituals.',
    product:
        'A premium LED lamp with adjustable warmth, app-free controls, recycled aluminum body, magnetic desk mount, and a 60-day trial.',
    tone: 'Warm, focused, premium, evidence-led',
    channels: 'Paid social, email nurture, landing page, creator kit, retail display',
};

function setState(state) {
    emptyState.classList.toggle('hidden', state !== 'empty');
    loadingState.classList.toggle('hidden', state !== 'loading');
    errorState.classList.toggle('hidden', state !== 'error');
    results.classList.toggle('hidden', state !== 'results');
}

function text(value) {
    return typeof value === 'string' ? value : '';
}

function listItems(container, items, tagName = 'li') {
    container.replaceChildren(
        ...items.map(item => {
            const node = document.createElement(tagName);
            node.textContent = item;
            return node;
        }),
    );
}

function renderCopyVariants(copyVariants) {
    const copyList = document.querySelector('#copy-list');
    copyList.replaceChildren(
        ...copyVariants.map((variant, index) => {
            const card = document.createElement('article');
            card.className = 'copy-card';

            const label = document.createElement('span');
            label.textContent = `Variant ${index + 1} · ${text(variant.channelFit)}`;

            const headline = document.createElement('h4');
            headline.textContent = text(variant.headline);

            const body = document.createElement('p');
            body.textContent = text(variant.body);

            card.append(label, headline, body);
            return card;
        }),
    );
}

function renderImages(generatedImages) {
    const imageGrid = document.querySelector('#image-grid');
    imageGrid.replaceChildren(
        ...generatedImages.map(image => {
            const card = document.createElement('article');
            card.className = 'prompt-card';

            if (image.image) {
                const img = document.createElement('img');
                img.src = image.image;
                img.alt = text(image.title) || 'Generated campaign visual';
                card.append(img);
            } else {
                const fallback = document.createElement('div');
                fallback.className = 'image-fallback';
                fallback.textContent = 'The image tool did not return image data for this prompt.';
                card.append(fallback);
            }

            const label = document.createElement('span');
            label.textContent = text(image.title) || 'Image prompt';

            const prompt = document.createElement('p');
            prompt.textContent = text(image.prompt);

            card.append(label, prompt);
            return card;
        }),
    );
}

function renderResults(data) {
    document.querySelector('#concept-name').textContent = text(data.concept?.name);
    document.querySelector('#concept-summary').textContent = text(data.concept?.summary);
    document.querySelector('#core-message').textContent = text(data.concept?.coreMessage);
    document.querySelector('#rationale').textContent = text(data.concept?.rationale);
    document.querySelector('#model-pill').textContent = `${data.meta?.textModel || 'Responses API'} + image tool`;

    renderCopyVariants(Array.isArray(data.copyVariants) ? data.copyVariants : []);
    listItems(document.querySelector('#checklist'), Array.isArray(data.launchChecklist) ? data.launchChecklist : []);
    listItems(document.querySelector('#strategy-notes'), Array.isArray(data.strategyNotes) ? data.strategyNotes : []);
    renderImages(Array.isArray(data.generatedImages) ? data.generatedImages : []);

    setState('results');
}

function getPayload() {
    const formData = new FormData(form);
    return {
        brief: formData.get('brief'),
        audience: formData.get('audience'),
        product: formData.get('product'),
        tone: formData.get('tone'),
        channels: String(formData.get('channels') || '')
            .split(',')
            .map(channel => channel.trim())
            .filter(Boolean),
    };
}

sampleButton.addEventListener('click', () => {
    Object.entries(sampleBrief).forEach(([name, value]) => {
        const field = form.elements.namedItem(name);
        if (field) field.value = value;
    });
    setState('empty');
});

form.addEventListener('submit', async event => {
    event.preventDefault();
    setState('loading');
    generateButton.disabled = true;

    try {
        const response = await fetch('/api/campaign', {
            method: 'POST',
            headers: {'content-type': 'application/json'},
            body: JSON.stringify(getPayload()),
        });
        const data = await response.json();

        if (!response.ok) throw new Error(data.error || 'The server returned an unexpected error.');
        renderResults(data);
    } catch (error) {
        errorMessage.textContent = error instanceof Error ? error.message : 'Unexpected browser error.';
        setState('error');
    } finally {
        generateButton.disabled = false;
    }
});

setState('empty');
