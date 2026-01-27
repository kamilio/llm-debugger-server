export function extractOpenAIChatText(messages = []) {
    let lastUser = '';
    const allParts = [];

    for (const message of messages) {
        const text = extractTextFromContent(message?.content);
        if (text) {
            allParts.push(text);
        }
        if (message?.role === 'user' && text) {
            lastUser = text;
        }
    }

    return { lastUser, allText: allParts.join('\n') };
}

export function extractAnthropicText(messages = []) {
    let lastUser = '';
    const allParts = [];

    for (const message of messages) {
        const text = extractAnthropicContent(message?.content);
        if (text) {
            allParts.push(text);
        }
        if (message?.role === 'user' && text) {
            lastUser = text;
        }
    }

    return { lastUser, allText: allParts.join('\n') };
}

export function extractGeminiText(contents = []) {
    let lastUser = '';
    const allParts = [];

    for (const content of contents) {
        const text = extractGeminiContent(content?.parts);
        if (text) {
            allParts.push(text);
        }
        if (content?.role === 'user' && text) {
            lastUser = text;
        }
    }

    return { lastUser, allText: allParts.join('\n') };
}

export function extractPromptText(prompt) {
    if (Array.isArray(prompt)) {
        return prompt.map((item) => String(item)).join('\n');
    }
    if (prompt === undefined || prompt === null) return '';
    return String(prompt);
}

export function extractInputText(input) {
    if (Array.isArray(input)) {
        return input.map((item) => (typeof item === 'string' ? item : JSON.stringify(item))).join('\n');
    }
    if (input === undefined || input === null) return '';
    return typeof input === 'string' ? input : JSON.stringify(input);
}

function extractTextFromContent(content) {
    if (!content) return '';
    if (typeof content === 'string') return content;
    if (Array.isArray(content)) {
        return content.map((part) => extractTextFromContent(part)).join('');
    }
    if (typeof content === 'object') {
        if (content.text) return String(content.text);
        if (content.content) return String(content.content);
    }
    return '';
}

function extractAnthropicContent(content = []) {
    if (!Array.isArray(content)) return '';
    return content
        .filter((block) => block?.type === 'text')
        .map((block) => block.text || '')
        .join('');
}

function extractGeminiContent(parts = []) {
    if (!Array.isArray(parts)) return '';
    return parts
        .filter((part) => typeof part?.text === 'string')
        .map((part) => part.text)
        .join('');
}
