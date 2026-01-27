import test from 'node:test';
import assert from 'node:assert/strict';
import { closeServer, createAnthropicClient, startTestServer } from './helpers.js';

async function withServer(modelsConfig, run) {
    const { server, baseUrl } = await startTestServer({ modelsConfig });
    try {
        await run(createAnthropicClient(baseUrl));
    } finally {
        await closeServer(server);
    }
}

const MODELS_CONFIG = {
    echo: [{ _default: { type: 'echo' } }],
    thinker: [{ _default: { type: 'message', content: 'Answer', reasoning: 'Thinking' } }],
};

test('Anthropic SDK covers messages, streaming, and token counting', async () => {
    await withServer(MODELS_CONFIG, async (client) => {
        const message = await client.messages.create({
            model: 'echo',
            max_tokens: 16,
            messages: [{ role: 'user', content: [{ type: 'text', text: 'hello' }] }],
        });
        const textBlock = message.content.find((block) => block.type === 'text');
        assert.equal(textBlock.text, 'hello');

        const stream = client.messages.stream({
            model: 'echo',
            max_tokens: 16,
            messages: [{ role: 'user', content: [{ type: 'text', text: 'stream' }] }],
        });
        const finalMessage = await stream.finalMessage();
        const finalText = finalMessage.content.find((block) => block.type === 'text');
        assert.equal(finalText.text, 'stream');

        const count = await client.messages.countTokens({
            model: 'echo',
            messages: [{ role: 'user', content: [{ type: 'text', text: 'hello' }] }],
        });
        assert.equal(count.input_tokens, 5);
    });
});

test('Anthropic SDK returns tool_use content', async () => {
    await withServer(MODELS_CONFIG, async (client) => {
        const message = await client.messages.create({
            model: 'echo',
            max_tokens: 16,
            messages: [{ role: 'user', content: [{ type: 'text', text: 'open file' }] }],
            tools: [
                {
                    name: 'read_file',
                    description: 'Read a file',
                    input_schema: {
                        type: 'object',
                        properties: { path: { type: 'string' } },
                        required: ['path'],
                    },
                },
            ],
            tool_choice: { type: 'tool', name: 'read_file' },
        }, {
            headers: { 'x-tool-result': JSON.stringify({ path: '/tmp/file.txt' }) },
        });

        const toolUse = message.content.find((block) => block.type === 'tool_use');
        assert.equal(toolUse.name, 'read_file');
        assert.deepEqual(toolUse.input, { path: '/tmp/file.txt' });
    });
});

test('Anthropic SDK models endpoints return anthropic shape', async () => {
    await withServer(MODELS_CONFIG, async (client) => {
        const list = await client.models.list({}, {
            headers: { 'x-provider': 'anthropic' },
        });
        assert.ok(list.data.length > 0);
        assert.equal(list.data[0].id, 'echo');

        const model = await client.models.retrieve('echo', {}, {
            headers: { 'x-provider': 'anthropic' },
        });
        assert.equal(model.id, 'echo');
    });
});
