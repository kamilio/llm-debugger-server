import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { createServer } from '../../src/server.js';
import { normalizeModels } from '../../src/model-config.js';

export async function startTestServer({ modelsConfig = {}, configOverrides = {} } = {}) {
    process.env.LLM_DEBUGGER_DAEMON = '1';
    const modelRegistry = normalizeModels(modelsConfig || {});
    const config = {
        host: '127.0.0.1',
        port: 0,
        strictValidation: false,
        requireAuth: false,
        defaultBehavior: 'Echo',
        embeddingSize: 8,
        latencyMs: 0,
        errorRate: 0,
        tokenCounting: 'chars',
        enableGeminiOpenAiCompat: false,
        configDir: process.cwd(),
        modelsConfig: modelsConfig || {},
        modelRegistry,
        ...configOverrides,
    };

    const server = createServer(config);
    await new Promise((resolve) => server.once('listening', resolve));
    const address = server.address();
    const port = typeof address === 'object' ? address.port : null;
    const baseUrl = `http://127.0.0.1:${port}`;

    return { server, port, baseUrl };
}

export function closeServer(server) {
    return new Promise((resolve) => server.close(resolve));
}

export function createOpenAIClient(baseUrl) {
    return new OpenAI({ apiKey: 'test-key', baseURL: `${baseUrl}/v1` });
}

export function createAnthropicClient(baseUrl) {
    return new Anthropic({ apiKey: 'test-key', baseURL: baseUrl });
}

export function createGeminiModel(baseUrl, modelName) {
    const genAI = new GoogleGenerativeAI('test-key');
    return genAI.getGenerativeModel(
        { model: modelName },
        { apiVersion: 'v1beta', baseUrl },
    );
}
