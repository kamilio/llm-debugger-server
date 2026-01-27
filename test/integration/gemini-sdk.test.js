import test from 'node:test';
import assert from 'node:assert/strict';
import { closeServer, createGeminiModel, startTestServer } from './helpers.js';

async function withServer(modelsConfig, run) {
    const { server, baseUrl } = await startTestServer({ modelsConfig });
    try {
        await run(baseUrl);
    } finally {
        await closeServer(server);
    }
}

const MODELS_CONFIG = {
    echo: [{ _default: { type: 'echo' } }],
};

test('Gemini SDK covers generate and countTokens', async () => {
    await withServer(MODELS_CONFIG, async (baseUrl) => {
        const model = createGeminiModel(baseUrl, 'echo');
        const result = await model.generateContent('hello');
        assert.equal(result.response.text(), 'hello');
        assert.equal(result.response.usageMetadata.promptTokenCount, 5);

        const count = await model.countTokens('hello');
        assert.equal(count.totalTokens, 5);
    });
});

test('Gemini SDK supports streaming and function calls', async () => {
    await withServer(MODELS_CONFIG, async (baseUrl) => {
        const model = createGeminiModel(baseUrl, 'echo');

        const streamResult = await model.generateContentStream('hello');
        let streamed = '';
        for await (const chunk of streamResult.stream) {
            streamed += chunk.text();
        }
        assert.equal(streamed, 'hello');

        const toolResult = await model.generateContent({
            contents: [{ role: 'user', parts: [{ text: 'open file' }] }],
            tools: [
                {
                    functionDeclarations: [
                        {
                            name: 'read_file',
                            description: 'Read a file',
                            parameters: {
                                type: 'object',
                                properties: { path: { type: 'string' } },
                                required: ['path'],
                            },
                        },
                    ],
                },
            ],
            toolConfig: {
                functionCallingConfig: {
                    allowedFunctionNames: ['read_file'],
                },
            },
        });

        const calls = toolResult.response.functionCalls();
        assert.equal(calls[0].name, 'read_file');
    });
});
