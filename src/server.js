#!/usr/bin/env node

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import yaml from 'js-yaml';
import { setTimeout as delay } from 'node:timers/promises';
import { buildServerConfig } from './server-config.js';
import { resolveResponse } from './behavior.js';
import {
    buildAnthropicMessageResponse,
    buildAnthropicStreamEvents,
    buildGeminiGenerateResponse,
    buildGeminiStreamChunks,
    buildOpenAIChatResponse,
    buildOpenAIChatStreamEvents,
    buildOpenAICompletionResponse,
    buildOpenAIEmbeddingResponse,
    buildOpenAIResponsesEvents,
    buildOpenAIResponsesResponse,
} from './translator.js';
import { parseMultipart } from './multipart.js';
import { FileStore } from './file-store.js';
import { buildOpenApiSpec } from './openapi.js';
import { buildPlaygroundHtml } from './ui.js';
import {
    extractAnthropicText,
    extractGeminiText,
    extractInputText,
    extractOpenAIChatText,
    extractPromptText,
} from './request-utils.js';
import {
    combineTokens,
    countTokens,
    generateId,
    normalizeHeaderValue,
    parseInteger,
} from './utils.js';
import { listModelNames } from './model-config.js';

const BUILTIN_MODELS = ['Echo', 'Robot', 'Weirdo', 'Thinker'];
const OPENAI_CHAT_FIELDS = new Set([
    'model',
    'messages',
    'temperature',
    'max_tokens',
    'stream',
    'stream_options',
    'seed',
    'tools',
    'tool_choice',
    'functions',
    'function_call',
    'top_p',
    'n',
    'stop',
]);
const OPENAI_COMPLETIONS_FIELDS = new Set([
    'model',
    'prompt',
    'max_tokens',
    'temperature',
    'top_p',
    'n',
    'stream',
    'stop',
    'seed',
]);
const OPENAI_EMBEDDINGS_FIELDS = new Set(['model', 'input', 'encoding_format', 'user']);
const OPENAI_RESPONSES_FIELDS = new Set([
    'model',
    'input',
    'stream',
    'stream_options',
    'temperature',
    'max_output_tokens',
    'tools',
    'tool_choice',
    'seed',
]);
const ANTHROPIC_MESSAGE_FIELDS = new Set([
    'model',
    'messages',
    'max_tokens',
    'stream',
    'temperature',
    'tools',
    'tool_choice',
    'system',
    'metadata',
]);
const ANTHROPIC_COUNT_FIELDS = new Set(['model', 'messages']);
const GEMINI_GENERATE_FIELDS = new Set(['contents', 'generationConfig', 'safetySettings', 'tools', 'toolConfig']);
const GEMINI_COUNT_FIELDS = new Set(['contents', 'generateContentRequest']);

export function createServer(config, { onListen } = {}) {
    const app = express();
    const fileStore = new FileStore();
    const openApiSpec = buildOpenApiSpec(config);
    const openApiYaml = yaml.dump(openApiSpec, { noRefs: true });
    const playgroundHtml = buildPlaygroundHtml();

    app.use(cors({ origin: '*' }));
    app.use(express.json({ limit: '2mb' }));

    app.use((req, res, next) => {
        const requestId = normalizeHeaderValue(req.headers['x-request-id']) || generateId('req');
        res.setHeader('x-request-id', requestId);
        req.requestId = requestId;
        next();
    });

    app.use((req, res, next) => {
        const start = Date.now();
        res.on('finish', () => {
            const duration = Date.now() - start;
            const summary = res.locals.inputSummary || '-';
            const behavior = res.locals.behavior || '-';
            console.log(
                `${req.method} ${req.originalUrl} ${res.statusCode} ${duration}ms input="${summary}" behavior="${behavior}"`,
            );
        });
        next();
    });

    app.use((req, res, next) => {
        if (!config.requireAuth) return next();
        const auth = req.headers.authorization || req.headers['x-api-key'];
        if (!auth) {
            return sendError(res, 'openai', 401, 'Missing API key');
        }
        return next();
    });

    app.get('/', (req, res) => {
        res.json({
            name: 'LLM Debugger Server',
            endpoints: listEndpoints(config),
        });
    });

    app.get('/playground', (req, res) => {
        res.type('html').send(playgroundHtml);
    });

    app.get('/openapi.json', (req, res) => {
        res.json(openApiSpec);
    });

    app.get('/openapi.yaml', (req, res) => {
        res.type('application/yaml').send(openApiYaml);
    });

    app.get('/health', (req, res) => {
        res.json({ status: 'ok' });
    });

    app.get('/__viewer__', (req, res) => {
        res.type('html').send(`<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>LLM Debugger Server</title>
</head>
<body>
  <h1>LLM Debugger Server</h1>
  <p>Server is running on ${config.host}:${config.port}</p>
  <ul>
    <li>Playground: <code>/playground</code></li>
    <li>OpenAPI: <code>/openapi.json</code> or <code>/openapi.yaml</code></li>
    <li>Health: <code>/health</code></li>
    <li>OpenAI: <code>/v1</code></li>
    <li>Anthropic: <code>/v1</code> with <code>x-provider: anthropic</code></li>
    <li>Gemini: <code>/v1beta</code></li>
  </ul>
</body>
</html>`);
    });

    app.get('/v1/models', (req, res) => {
        const provider = normalizeProvider(req);
        if (provider === 'anthropic') {
            return res.json({
                data: listAnthropicModels(config),
            });
        }
        return res.json({
            object: 'list',
            data: listOpenAIModels(config),
        });
    });

    app.get('/v1/models/:model', (req, res) => {
        const provider = normalizeProvider(req);
        const model = req.params.model;
        if (provider === 'anthropic') {
            return res.json({ id: model, display_name: model });
        }
        return res.json({ id: model, object: 'model', owned_by: 'dummy' });
    });

    app.post('/v1/chat/completions', async (req, res) => {
        await handleOpenAIChat({ req, res, config });
    });

    app.post('/v1/completions', async (req, res) => {
        await handleOpenAICompletions({ req, res, config });
    });

    app.post('/v1/embeddings', async (req, res) => {
        await handleOpenAIEmbeddings({ req, res, config });
    });

    app.post('/v1/responses', async (req, res) => {
        await handleOpenAIResponses({ req, res, config });
    });

    app.post('/v1/audio/transcriptions', async (req, res) => {
        await handleAudioTranscriptions({ req, res, config });
    });

    app.post('/v1/audio/translations', async (req, res) => {
        await handleAudioTranslations({ req, res, config });
    });

    app.post('/v1/images/generations', async (req, res) => {
        await handleImageGenerations({ req, res, config });
    });

    app.post('/v1/images/edits', async (req, res) => {
        await handleImageEdits({ req, res, config });
    });

    app.post('/v1/images/variations', async (req, res) => {
        await handleImageVariations({ req, res, config });
    });

    app.post('/v1/moderations', async (req, res) => {
        await handleModerations({ req, res, config });
    });

    app.post('/v1/files', async (req, res) => {
        await handleFilesUpload({ req, res, fileStore });
    });

    app.get('/v1/files', (req, res) => {
        res.json({ object: 'list', data: fileStore.list() });
    });

    app.get('/v1/files/:fileId', (req, res) => {
        const file = fileStore.get(req.params.fileId);
        if (!file) {
            return sendError(res, 'openai', 404, 'File not found');
        }
        return res.json(file);
    });

    app.delete('/v1/files/:fileId', (req, res) => {
        res.json(fileStore.delete(req.params.fileId));
    });

    if (config.enableGeminiOpenAiCompat) {
        app.get('/v1beta/openai/models', (req, res) => {
            const provider = normalizeProvider(req);
            if (provider === 'anthropic') {
                return res.json({ data: listAnthropicModels(config) });
            }
            return res.json({ object: 'list', data: listOpenAIModels(config) });
        });

        app.get('/v1beta/openai/models/:model', (req, res) => {
            const provider = normalizeProvider(req);
            const model = req.params.model;
            if (provider === 'anthropic') {
                return res.json({ id: model, display_name: model });
            }
            return res.json({ id: model, object: 'model', owned_by: 'dummy' });
        });

        app.post('/v1beta/openai/chat/completions', async (req, res) => {
            await handleOpenAIChat({ req, res, config });
        });

        app.post('/v1beta/openai/completions', async (req, res) => {
            await handleOpenAICompletions({ req, res, config });
        });

        app.post('/v1beta/openai/embeddings', async (req, res) => {
            await handleOpenAIEmbeddings({ req, res, config });
        });

        app.post('/v1beta/openai/responses', async (req, res) => {
            await handleOpenAIResponses({ req, res, config });
        });

        app.post('/v1beta/openai/audio/transcriptions', async (req, res) => {
            await handleAudioTranscriptions({ req, res, config });
        });

        app.post('/v1beta/openai/audio/translations', async (req, res) => {
            await handleAudioTranslations({ req, res, config });
        });

        app.post('/v1beta/openai/images/generations', async (req, res) => {
            await handleImageGenerations({ req, res, config });
        });

        app.post('/v1beta/openai/images/edits', async (req, res) => {
            await handleImageEdits({ req, res, config });
        });

        app.post('/v1beta/openai/images/variations', async (req, res) => {
            await handleImageVariations({ req, res, config });
        });

        app.post('/v1beta/openai/moderations', async (req, res) => {
            await handleModerations({ req, res, config });
        });

        app.post('/v1beta/openai/files', async (req, res) => {
            await handleFilesUpload({ req, res, fileStore });
        });

        app.get('/v1beta/openai/files', (req, res) => {
            res.json({ object: 'list', data: fileStore.list() });
        });

        app.get('/v1beta/openai/files/:fileId', (req, res) => {
            const file = fileStore.get(req.params.fileId);
            if (!file) {
                return sendError(res, 'openai', 404, 'File not found');
            }
            return res.json(file);
        });

        app.delete('/v1beta/openai/files/:fileId', (req, res) => {
            res.json(fileStore.delete(req.params.fileId));
        });
    }

    app.post('/v1/messages', async (req, res) => {
        await handleAnthropicMessages({ req, res, config });
    });

    app.post('/v1/messages/count_tokens', async (req, res) => {
        await handleAnthropicCountTokens({ req, res, config });
    });

    app.get('/v1beta/models', (req, res) => {
        res.json({ models: listGeminiModels(config) });
    });

    app.get('/v1beta/models/:model', (req, res) => {
        const model = req.params.model;
        res.json({ name: `models/${model}`, displayName: model });
    });

    app.post('/v1beta/models/:modelAction', async (req, res) => {
        const { model, action } = parseGeminiModelAction(req.params.modelAction);
        req.params.model = model;
        if (action === 'generateContent') {
            await handleGeminiGenerate({ req, res, config });
        } else if (action === 'streamGenerateContent') {
            await handleGeminiStream({ req, res, config });
        } else if (action === 'countTokens') {
            await handleGeminiCountTokens({ req, res, config });
        } else {
            sendError(res, 'gemini', 404, `Unknown action: ${action}`);
        }
    });

    app.use((req, res) => {
        res.status(404).json({ error: { message: 'Not found' } });
    });

    const server = app.listen(config.port, config.host, () => {
        if (typeof onListen === 'function') {
            onListen(server);
        }
        if (process.env.LLM_DEBUGGER_DAEMON !== '1') {
            console.log(`LLM debugger server listening on http://${config.host}:${config.port}`);
        }
    });

    return server;
}

function listEndpoints(config) {
    const endpoints = {
        core: [
            'GET /',
            'GET /playground',
            'GET /openapi.json',
            'GET /openapi.yaml',
            'GET /health',
            'GET /__viewer__',
        ],
        openai: [
            'GET /v1/models',
            'GET /v1/models/:model',
            'POST /v1/chat/completions',
            'POST /v1/completions',
            'POST /v1/embeddings',
            'POST /v1/responses',
            'POST /v1/audio/transcriptions',
            'POST /v1/audio/translations',
            'POST /v1/images/generations',
            'POST /v1/images/edits',
            'POST /v1/images/variations',
            'POST /v1/moderations',
            'POST /v1/files',
            'GET /v1/files',
            'GET /v1/files/:fileId',
            'DELETE /v1/files/:fileId',
        ],
        anthropic: [
            'POST /v1/messages',
            'POST /v1/messages/count_tokens',
            'GET /v1/models (x-provider: anthropic)',
            'GET /v1/models/:model (x-provider: anthropic)',
        ],
        gemini: [
            'GET /v1beta/models',
            'GET /v1beta/models/:model',
            'POST /v1beta/models/:model:generateContent',
            'POST /v1beta/models/:model:streamGenerateContent',
            'POST /v1beta/models/:model:countTokens',
        ],
    };

    if (config.enableGeminiOpenAiCompat) {
        endpoints.geminiOpenAiCompat = [
            'GET /v1beta/openai/models',
            'GET /v1beta/openai/models/:model',
            'POST /v1beta/openai/chat/completions',
            'POST /v1beta/openai/completions',
            'POST /v1beta/openai/embeddings',
            'POST /v1beta/openai/responses',
            'POST /v1beta/openai/audio/transcriptions',
            'POST /v1beta/openai/audio/translations',
            'POST /v1beta/openai/images/generations',
            'POST /v1beta/openai/images/edits',
            'POST /v1beta/openai/images/variations',
            'POST /v1beta/openai/moderations',
            'POST /v1beta/openai/files',
            'GET /v1beta/openai/files',
            'GET /v1beta/openai/files/:fileId',
            'DELETE /v1beta/openai/files/:fileId',
        ];
    }

    return endpoints;
}

async function handleOpenAIChat({ req, res, config }) {
    const body = req.body || {};
    if (!validateBody(body, OPENAI_CHAT_FIELDS, res, 'openai', config)) {
        return;
    }
    if (!body.model) {
        return sendError(res, 'openai', 400, 'Missing model');
    }
    const resolvedModel = resolveModelName(body.model, config);
    if (shouldRejectModel(resolvedModel, config)) {
        return sendError(res, 'openai', 404, 'Unknown model', 'model', 'invalid_model');
    }

    const { lastUser, allText } = extractOpenAIChatText(body.messages || []);
    res.locals.inputSummary = lastUser || allText || '';

    const simulated = getSimulatedError(req, config, body);
    if (simulated) {
        return sendError(res, 'openai', simulated.status, simulated.message);
    }

    const result = await resolveResponse({
        config,
        modelName: resolvedModel,
        inputText: allText,
        lastUserMessage: lastUser,
        requestBody: body,
        headers: req.headers,
    });

    res.locals.behavior = result.behavior;
    if (result.mode === 'file') {
        return handleRecordedResponse({ req, res, config, recorded: result.file });
    }
    if (result.mode === 'error') {
        return sendError(res, 'openai', result.error.status, result.error.message);
    }

    const stream = body.stream === true;
    if (stream) {
        const includeUsage = body.stream_options?.include_usage === true;
        const events = buildOpenAIChatStreamEvents({ response: result.response, model: body.model, includeUsage });
        return streamSse(res, events, calculateDelay(req, config));
    }

    await applyDelay(req, config);
    return res.json(buildOpenAIChatResponse({ response: result.response, model: body.model }));
}

async function handleOpenAICompletions({ req, res, config }) {
    const body = req.body || {};
    if (!validateBody(body, OPENAI_COMPLETIONS_FIELDS, res, 'openai', config)) {
        return;
    }
    if (!body.model) {
        return sendError(res, 'openai', 400, 'Missing model');
    }
    const resolvedModel = resolveModelName(body.model, config);
    if (shouldRejectModel(resolvedModel, config)) {
        return sendError(res, 'openai', 404, 'Unknown model', 'model', 'invalid_model');
    }

    const promptText = extractPromptText(body.prompt);
    res.locals.inputSummary = promptText;

    const simulated = getSimulatedError(req, config, body);
    if (simulated) {
        return sendError(res, 'openai', simulated.status, simulated.message);
    }

    const result = await resolveResponse({
        config,
        modelName: resolvedModel,
        inputText: promptText,
        lastUserMessage: promptText,
        requestBody: body,
        headers: req.headers,
    });

    res.locals.behavior = result.behavior;
    if (result.mode === 'file') {
        return handleRecordedResponse({ req, res, config, recorded: result.file });
    }
    if (result.mode === 'error') {
        return sendError(res, 'openai', result.error.status, result.error.message);
    }

    await applyDelay(req, config);
    return res.json(
        buildOpenAICompletionResponse({
            text: result.response.content ?? '',
            model: body.model,
            usage: result.response.usage,
        }),
    );
}

async function handleOpenAIEmbeddings({ req, res, config }) {
    const body = req.body || {};
    if (!validateBody(body, OPENAI_EMBEDDINGS_FIELDS, res, 'openai', config)) {
        return;
    }
    if (!body.model) {
        return sendError(res, 'openai', 400, 'Missing model');
    }
    const resolvedModel = resolveModelName(body.model, config);
    if (shouldRejectModel(resolvedModel, config)) {
        return sendError(res, 'openai', 404, 'Unknown model', 'model', 'invalid_model');
    }

    const input = body.input;
    const inputs = Array.isArray(input) ? input : [input];
    const rawEmbeddings = inputs.map((item) => generateEmbedding(String(item ?? ''), config.embeddingSize));
    const encodingFormat = body.encoding_format || 'float';
    const embeddings = encodingFormat === 'base64'
        ? rawEmbeddings.map(encodeEmbeddingBase64)
        : rawEmbeddings;
    const totalInput = inputs.map((item) => String(item ?? ''));
    const usage = { input: combineTokens(totalInput, config.tokenCounting) };

    res.locals.inputSummary = totalInput.join(' ');
    res.locals.behavior = 'embedding';

    await applyDelay(req, config);
    return res.json(buildOpenAIEmbeddingResponse({ embeddings, model: body.model, usage }));
}

async function handleOpenAIResponses({ req, res, config }) {
    const body = req.body || {};
    if (!validateBody(body, OPENAI_RESPONSES_FIELDS, res, 'openai', config)) {
        return;
    }
    if (!body.model) {
        return sendError(res, 'openai', 400, 'Missing model');
    }
    const resolvedModel = resolveModelName(body.model, config);
    if (shouldRejectModel(resolvedModel, config)) {
        return sendError(res, 'openai', 404, 'Unknown model', 'model', 'invalid_model');
    }

    const inputText = extractInputText(body.input);
    res.locals.inputSummary = inputText;

    const simulated = getSimulatedError(req, config, body);
    if (simulated) {
        return sendError(res, 'openai', simulated.status, simulated.message);
    }

    const result = await resolveResponse({
        config,
        modelName: resolvedModel,
        inputText,
        lastUserMessage: inputText,
        requestBody: body,
        headers: req.headers,
    });

    res.locals.behavior = result.behavior;
    if (result.mode === 'file') {
        return handleRecordedResponse({ req, res, config, recorded: result.file });
    }
    if (result.mode === 'error') {
        return sendError(res, 'openai', result.error.status, result.error.message);
    }

    if (body.stream === true) {
        const events = buildOpenAIResponsesEvents({ response: result.response, model: body.model });
        return streamSse(res, events, calculateDelay(req, config));
    }

    await applyDelay(req, config);
    return res.json(buildOpenAIResponsesResponse({ response: result.response, model: body.model }));
}

async function handleAnthropicMessages({ req, res, config }) {
    const body = req.body || {};
    if (!validateBody(body, ANTHROPIC_MESSAGE_FIELDS, res, 'anthropic', config)) {
        return;
    }
    if (!body.model) {
        return sendError(res, 'anthropic', 400, 'Missing model');
    }
    const resolvedModel = resolveModelName(body.model, config);
    if (shouldRejectModel(resolvedModel, config)) {
        return sendError(res, 'anthropic', 404, 'Unknown model');
    }

    const { lastUser, allText } = extractAnthropicText(body.messages || []);
    res.locals.inputSummary = lastUser || allText || '';

    const simulated = getSimulatedError(req, config, body);
    if (simulated) {
        return sendError(res, 'anthropic', simulated.status, simulated.message);
    }

    const result = await resolveResponse({
        config,
        modelName: resolvedModel,
        inputText: allText,
        lastUserMessage: lastUser,
        requestBody: body,
        headers: req.headers,
    });

    res.locals.behavior = result.behavior;
    if (result.mode === 'file') {
        return handleRecordedResponse({ req, res, config, recorded: result.file });
    }
    if (result.mode === 'error') {
        return sendError(res, 'anthropic', result.error.status, result.error.message);
    }

    if (body.stream === true) {
        const events = buildAnthropicStreamEvents({ response: result.response, model: body.model });
        return streamSse(res, events, calculateDelay(req, config), { includeEvent: true });
    }

    await applyDelay(req, config);
    return res.json(buildAnthropicMessageResponse({ response: result.response, model: body.model }));
}

async function handleAnthropicCountTokens({ req, res, config }) {
    const body = req.body || {};
    if (!validateBody(body, ANTHROPIC_COUNT_FIELDS, res, 'anthropic', config)) {
        return;
    }
    const { allText } = extractAnthropicText(body.messages || []);
    res.locals.inputSummary = allText || '';
    res.locals.behavior = 'count_tokens';
    await applyDelay(req, config);
    return res.json({ input_tokens: countTokens(allText, config.tokenCounting) });
}

async function handleGeminiGenerate({ req, res, config }) {
    const body = req.body || {};
    if (!validateBody(body, GEMINI_GENERATE_FIELDS, res, 'gemini', config)) {
        return;
    }
    const model = req.params.model;
    const resolvedModel = resolveModelName(model, config);
    if (shouldRejectModel(resolvedModel, config)) {
        return sendError(res, 'gemini', 404, 'Unknown model');
    }

    const { lastUser, allText } = extractGeminiText(body.contents || []);
    res.locals.inputSummary = lastUser || allText || '';

    const simulated = getSimulatedError(req, config, body);
    if (simulated) {
        return sendError(res, 'gemini', simulated.status, simulated.message);
    }

    const result = await resolveResponse({
        config,
        modelName: resolvedModel,
        inputText: allText,
        lastUserMessage: lastUser,
        requestBody: body,
        headers: req.headers,
    });

    res.locals.behavior = result.behavior;
    if (result.mode === 'file') {
        return handleRecordedResponse({ req, res, config, recorded: result.file });
    }
    if (result.mode === 'error') {
        return sendError(res, 'gemini', result.error.status, result.error.message);
    }

    await applyDelay(req, config);
    return res.json(buildGeminiGenerateResponse({ response: result.response, model }));
}

async function handleGeminiStream({ req, res, config }) {
    const body = req.body || {};
    if (!validateBody(body, GEMINI_GENERATE_FIELDS, res, 'gemini', config)) {
        return;
    }
    const model = req.params.model;
    const resolvedModel = resolveModelName(model, config);
    if (shouldRejectModel(resolvedModel, config)) {
        return sendError(res, 'gemini', 404, 'Unknown model');
    }

    const { lastUser, allText } = extractGeminiText(body.contents || []);
    res.locals.inputSummary = lastUser || allText || '';

    const simulated = getSimulatedError(req, config, body);
    if (simulated) {
        return sendError(res, 'gemini', simulated.status, simulated.message);
    }

    const result = await resolveResponse({
        config,
        modelName: resolvedModel,
        inputText: allText,
        lastUserMessage: lastUser,
        requestBody: body,
        headers: req.headers,
    });

    res.locals.behavior = result.behavior;
    if (result.mode === 'file') {
        return handleRecordedResponse({ req, res, config, recorded: result.file });
    }
    if (result.mode === 'error') {
        return sendError(res, 'gemini', result.error.status, result.error.message);
    }

    const chunks = buildGeminiStreamChunks({ response: result.response, model });
    const streamFormat = req.query.stream_format;
    const isNdjson = streamFormat === 'ndjson';

    return streamSse(res, chunks.map((data) => ({ data })), calculateDelay(req, config), {
        contentType: isNdjson ? 'application/x-ndjson' : 'text/event-stream',
        useNdjson: isNdjson,
    });
}

async function handleGeminiCountTokens({ req, res, config }) {
    const body = req.body || {};
    if (!validateBody(body, GEMINI_COUNT_FIELDS, res, 'gemini', config)) {
        return;
    }
    const contents = body.contents || body.generateContentRequest?.contents || [];
    const { allText } = extractGeminiText(contents);
    res.locals.inputSummary = allText || '';
    res.locals.behavior = 'count_tokens';
    await applyDelay(req, config);
    return res.json({ totalTokens: countTokens(allText, config.tokenCounting) });
}

async function handleAudioTranscriptions({ req, res, config }) {
    const { fields } = await parseMultipart(req);
    const prompt = fields.prompt || '';
    const text = prompt || 'transcribed text';

    res.locals.inputSummary = text;
    res.locals.behavior = 'audio_transcription';

    await applyDelay(req, config);

    if (fields.response_format === 'verbose_json') {
        return res.json({
            text,
            language: fields.language || 'en',
            segments: [
                { id: 0, start: 0, end: 1.0, text },
            ],
            usage: buildAudioUsage(text, config),
        });
    }

    return res.json({ text });
}

async function handleAudioTranslations({ req, res, config }) {
    const { fields } = await parseMultipart(req);
    const prompt = fields.prompt || '';
    const text = prompt || 'translated text';

    res.locals.inputSummary = text;
    res.locals.behavior = 'audio_translation';

    await applyDelay(req, config);
    return res.json({ text });
}

async function handleImageGenerations({ req, res, config }) {
    const body = req.body || {};
    await respondWithImages({ req, res, config, body, context: 'generation' });
}

async function handleImageEdits({ req, res, config }) {
    const { fields } = await parseMultipart(req);
    await respondWithImages({ req, res, config, body: fields, context: 'edit' });
}

async function handleImageVariations({ req, res, config }) {
    const { fields } = await parseMultipart(req);
    await respondWithImages({ req, res, config, body: fields, context: 'variation' });
}

async function handleModerations({ req, res, config }) {
    res.locals.inputSummary = extractInputText(req.body?.input) || '';
    res.locals.behavior = 'moderation';
    await applyDelay(req, config);
    return res.json({
        id: generateId('modr'),
        model: req.body?.model || 'omni-moderation-latest',
        results: [
            {
                flagged: false,
                categories: { hate: false, violence: false },
                category_scores: { hate: 0.0, violence: 0.0 },
            },
        ],
    });
}

async function handleFilesUpload({ req, res, fileStore }) {
    const { fields, files } = await parseMultipart(req);
    const file = files.find((entry) => entry.fieldname === 'file') || files[0];
    if (!file) {
        return sendError(res, 'openai', 400, 'Missing file');
    }

    const record = fileStore.create({
        filename: file.filename,
        purpose: fields.purpose,
        buffer: file.buffer,
        mimeType: file.mimeType,
    });

    return res.json({
        id: record.id,
        object: 'file',
        bytes: record.bytes,
        created_at: record.created_at,
        filename: record.filename,
        purpose: record.purpose,
    });
}

async function handleRecordedResponse({ req, res, config, recorded }) {
    if (!recorded) {
        return sendError(res, 'openai', 500, 'Fixture missing');
    }

    if (recorded.error) {
        return sendError(res, 'openai', 500, recorded.error.message || 'Fixture error');
    }

    const response = recorded.response || {};
    const headers = response.headers || {};
    const status = response.status || 200;
    const isStreaming = Boolean(response.is_streaming ?? recorded?.is_streaming ?? recorded?.request?.body?.stream);
    const body = response.body;
    const delayMs = calculateDelay(req, config, recorded.duration_ms || 0);

    if (!isStreaming) {
        if (headers) {
            Object.entries(headers).forEach(([key, value]) => res.setHeader(key, value));
        }
        await applyDelay(req, config, recorded.duration_ms || 0);
        return res.status(status).json(body ?? {});
    }

    const events = Array.isArray(body) ? body : [body];
    const contentType = headers['content-type'] || headers['Content-Type'] || 'text/event-stream';
    return streamRecorded(res, events, delayMs, contentType);
}

function streamRecorded(res, events, delayMs, contentType) {
    const useNdjson = contentType.includes('ndjson');
    const normalized = events.map((chunk) => normalizeRecordedEvent(chunk));
    const includeEvent = normalized.some((event) => Boolean(event.event));
    return streamSse(res, normalized, delayMs, { contentType, useNdjson, includeEvent });
}

function normalizeRecordedEvent(chunk) {
    if (chunk && typeof chunk === 'object' && chunk.done) {
        return { data: '[DONE]' };
    }
    if (chunk && typeof chunk === 'object' && chunk.event) {
        return { event: chunk.event, data: chunk.data ?? chunk };
    }
    if (chunk && typeof chunk === 'object' && chunk.type && chunk.type.startsWith('message_')) {
        return { event: chunk.type, data: chunk };
    }
    return { data: chunk };
}

async function respondWithImages({ req, res, config, body, context }) {
    const prompt = body.prompt || '';
    const n = parseInteger(body.n, 1) || 1;
    const format = body.response_format || 'url';
    const model = body.model || 'image-model';

    res.locals.inputSummary = prompt;
    res.locals.behavior = `image_${context}`;

    await applyDelay(req, config);

    const data = [];
    for (let i = 0; i < n; i += 1) {
        if (format === 'b64_json') {
            data.push({ b64_json: Buffer.from(`dummy-${i}`).toString('base64') });
        } else {
            data.push({ url: `https://dummy.local/image/${generateId('img')}` });
        }
    }

    const payload = { created: Math.floor(Date.now() / 1000), data };
    if (model.toLowerCase().includes('gpt')) {
        payload.usage = {
            input_tokens: countTokens(prompt, config.tokenCounting),
            output_tokens: 0,
            total_tokens: countTokens(prompt, config.tokenCounting),
            input_tokens_details: { text_tokens: countTokens(prompt, config.tokenCounting), image_tokens: 0 },
        };
    }

    return res.json(payload);
}

function listOpenAIModels(config) {
    const names = getModelNames(config);
    return names.map((name) => ({ id: name, object: 'model', owned_by: 'dummy' }));
}

function listAnthropicModels(config) {
    const names = getModelNames(config);
    return names.map((name) => ({ id: name, display_name: name }));
}

function listGeminiModels(config) {
    const names = getModelNames(config);
    return names.map((name) => ({ name: `models/${name}`, displayName: name }));
}

function getModelNames(config) {
    const names = listModelNames(config.modelRegistry, { excludeBaseModels: true });
    if (names.length === 0) {
        return BUILTIN_MODELS;
    }
    return names;
}

function normalizeProvider(req) {
    const providerHeader = normalizeHeaderValue(req.headers['x-provider']);
    if (providerHeader && String(providerHeader).toLowerCase() === 'anthropic') {
        return 'anthropic';
    }
    return 'openai';
}

function resolveModelName(model, config) {
    if (!model) return model;
    if (config.modelRegistry.triggerModels.has(model) || config.modelRegistry.behaviorModels.has(model)) {
        return model;
    }
    const lowered = String(model).toLowerCase();
    for (const name of config.modelRegistry.triggerModels.keys()) {
        if (name.toLowerCase() === lowered) return name;
    }
    for (const name of config.modelRegistry.behaviorModels.keys()) {
        if (name.toLowerCase() === lowered) return name;
    }
    return model;
}

function shouldRejectModel(model, config) {
    const hasConfigModels =
        config.modelRegistry.triggerModels.size > 0 || config.modelRegistry.behaviorModels.size > 0;
    if (!hasConfigModels) return false;
    return !config.modelRegistry.triggerModels.has(model) && !config.modelRegistry.behaviorModels.has(model);
}

function calculateDelay(req, config, extraDelay = 0) {
    const headerDelay = parseInteger(normalizeHeaderValue(req.headers['x-delay-ms']), 0) || 0;
    return (config.latencyMs || 0) + headerDelay + extraDelay;
}

async function applyDelay(req, config, extraDelay = 0) {
    const delayMs = calculateDelay(req, config, extraDelay);
    if (delayMs > 0) {
        await delay(delayMs);
    }
}

function getSimulatedError(req, config, body) {
    const headerValue = normalizeHeaderValue(req.headers['x-error']);
    const simulateValue = body?.simulate_error;
    const directive = headerValue ?? simulateValue;

    if (directive !== undefined && directive !== null && directive !== '') {
        if (typeof directive === 'object') {
            return {
                status: directive.status || 400,
                message: directive.message || 'Simulated error',
            };
        }
        const parsed = parseInteger(directive, null);
        return {
            status: parsed || 400,
            message: `Simulated error (${directive})`,
        };
    }

    if (config.errorRate > 0 && body?.seed !== undefined) {
        const seed = Number(body.seed);
        if (Number.isFinite(seed)) {
            const random = seededRandom(seed);
            if (random < config.errorRate) {
                return { status: 500, message: 'Simulated error' };
            }
        }
    }

    return null;
}

function seededRandom(seed) {
    const x = Math.sin(seed) * 10000;
    return x - Math.floor(x);
}

function streamSse(res, events, delayMs, { includeEvent = false, contentType = 'text/event-stream', useNdjson = false } = {}) {
    res.status(200);
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    let chunkDelay = 0;
    if (delayMs > 0 && events.length > 0) {
        chunkDelay = Math.floor(delayMs / events.length);
    }

    const writeEvent = async (event) => {
        if (useNdjson) {
            res.write(`${JSON.stringify(event.data)}\n`);
            return;
        }

        if (event.event && includeEvent) {
            res.write(`event: ${event.event}\n`);
        }
        if (event.data === '[DONE]') {
            res.write('data: [DONE]\n\n');
        } else if (typeof event.data === 'string') {
            res.write(`data: ${event.data}\n\n`);
        } else {
            res.write(`data: ${JSON.stringify(event.data)}\n\n`);
        }
    };

    const run = async () => {
        for (const event of events) {
            if (chunkDelay > 0) {
                await delay(chunkDelay);
            }
            await writeEvent(event);
        }
        res.end();
    };

    run().catch((error) => {
        console.error('Streaming error', error);
        res.end();
    });
}

function validateBody(body, allowedFields, res, provider, config) {
    if (!config.strictValidation) return true;
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
        sendError(res, provider, 400, 'Invalid JSON body');
        return false;
    }
    const unknown = Object.keys(body).filter((key) => !allowedFields.has(key));
    if (unknown.length > 0) {
        sendError(res, provider, 400, `Unknown fields: ${unknown.join(', ')}`);
        return false;
    }
    return true;
}

function sendError(res, provider, status, message, param, code) {
    if (provider === 'anthropic') {
        return res.status(status).json({
            type: 'error',
            error: {
                type: 'invalid_request_error',
                message,
            },
        });
    }
    if (provider === 'gemini') {
        return res.status(status).json({
            error: {
                code: status,
                message,
                status: 'INVALID_ARGUMENT',
            },
        });
    }
    return res.status(status).json({
        error: {
            message,
            type: 'invalid_request_error',
            param,
            code,
        },
    });
}

function generateEmbedding(text, size) {
    const hash = Array.from(text).reduce((acc, char) => acc + char.charCodeAt(0), 0);
    const vector = [];
    for (let i = 0; i < size; i += 1) {
        const value = ((hash + i * 31) % 1000) / 1000;
        vector.push(Number(value.toFixed(4)));
    }
    return vector;
}

function encodeEmbeddingBase64(embedding) {
    const buffer = Buffer.alloc(embedding.length * 4);
    for (let i = 0; i < embedding.length; i += 1) {
        buffer.writeFloatLE(embedding[i], i * 4);
    }
    return buffer.toString('base64');
}

function parseGeminiModelAction(modelAction) {
    const colonIndex = modelAction.indexOf(':');
    if (colonIndex === -1) {
        return { model: modelAction, action: '' };
    }
    return {
        model: modelAction.slice(0, colonIndex),
        action: modelAction.slice(colonIndex + 1),
    };
}

function buildAudioUsage(text, config) {
    const tokens = countTokens(text, config.tokenCounting);
    return {
        type: 'tokens',
        input_tokens: tokens,
        input_token_details: { text_tokens: tokens, audio_tokens: 0 },
        output_tokens: 0,
        total_tokens: tokens,
    };
}

const isMain = process.argv[1] && process.argv[1].endsWith('server.js');
if (isMain) {
    const { config } = await buildServerConfig();
    createServer(config);
}
