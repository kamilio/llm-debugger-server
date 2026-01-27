import { createServer } from '../../src/server.js';
import { normalizeModels } from '../../src/model-config.js';

export async function startTestServer(modelsConfig) {
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
    };

    const server = createServer(config);
    await new Promise((resolve) => server.once('listening', resolve));
    const address = server.address();
    const port = typeof address === 'object' ? address.port : null;

    return { server, port };
}
