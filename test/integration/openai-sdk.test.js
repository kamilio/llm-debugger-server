import test from 'node:test';
import assert from 'node:assert/strict';
import { toFile } from 'openai';
import { closeServer, createOpenAIClient, startTestServer } from './helpers.js';

async function withServer(modelsConfig, run) {
    const { server, baseUrl } = await startTestServer({ modelsConfig });
    try {
        await run(createOpenAIClient(baseUrl));
    } finally {
        await closeServer(server);
    }
}

const MODELS_CONFIG = {
    echo: [{ _default: { type: 'echo' } }],
    'gpt-4': [
        { 'load fixture': { type: 'file', path: 'fixtures/recorded-response.yaml' } },
        { _default: { type: 'echo' } },
    ],
};

test('OpenAI SDK covers core endpoints', async () => {
    await withServer(MODELS_CONFIG, async (client) => {
        const models = await client.models.list();
        const modelIds = models.data.map((entry) => entry.id);
        assert.ok(modelIds.includes('echo'));

        const model = await client.models.retrieve('echo');
        assert.equal(model.id, 'echo');

        const chat = await client.chat.completions.create({
            model: 'echo',
            messages: [{ role: 'user', content: 'hello' }],
        });
        assert.equal(chat.choices[0].message.content, 'hello');

        const responses = await client.responses.create({
            model: 'echo',
            input: 'hello',
        });
        assert.equal(responses.output[0].content[0].text, 'hello');

        const embeddings = await client.embeddings.create({
            model: 'echo',
            input: ['hi', 'there'],
        });
        assert.equal(embeddings.data.length, 2);
        assert.equal(embeddings.data[0].embedding.length, 8);

        const moderation = await client.moderations.create({
            model: 'omni-moderation-latest',
            input: 'safe',
        });
        assert.equal(moderation.results[0].flagged, false);
    });
});

test('OpenAI SDK supports streaming, tools, and fixtures', async () => {
    await withServer(MODELS_CONFIG, async (client) => {
        const stream = await client.chat.completions.create({
            model: 'echo',
            messages: [{ role: 'user', content: 'hello' }],
            stream: true,
        });
        let streamed = '';
        for await (const chunk of stream) {
            streamed += chunk.choices?.[0]?.delta?.content ?? '';
        }
        assert.equal(streamed, 'hello');

        const responseStream = await client.responses.create({
            model: 'echo',
            input: 'hello',
            stream: true,
        });
        let responseText = '';
        let sawCompleted = false;
        for await (const event of responseStream) {
            if (event.type === 'response.output_text.delta') {
                responseText += event.delta;
            }
            if (event.type === 'response.completed') {
                sawCompleted = true;
            }
        }
        assert.equal(responseText, 'hello');
        assert.ok(sawCompleted);

        const toolsResponse = await client.chat.completions.create({
            model: 'echo',
            messages: [{ role: 'user', content: 'open file' }],
            tools: [
                {
                    type: 'function',
                    function: {
                        name: 'read_file',
                        parameters: {
                            type: 'object',
                            properties: { path: { type: 'string' } },
                            required: ['path'],
                        },
                    },
                },
            ],
            tool_choice: { type: 'function', function: { name: 'read_file' } },
        }, {
            headers: { 'x-tool-result': JSON.stringify({ path: '/tmp/file.txt' }) },
        });
        const toolCall = toolsResponse.choices[0].message.tool_calls[0];
        assert.equal(toolCall.function.name, 'read_file');
        assert.deepEqual(JSON.parse(toolCall.function.arguments), { path: '/tmp/file.txt' });

        const fixtureStream = await client.chat.completions.create({
            model: 'gpt-4',
            messages: [{ role: 'user', content: 'load fixture' }],
            stream: true,
        });
        let fixtureText = '';
        for await (const chunk of fixtureStream) {
            fixtureText += chunk.choices?.[0]?.delta?.content ?? '';
        }
        assert.equal(fixtureText, 'Hello!');
    });
});

test('OpenAI SDK exercises media and file endpoints', async () => {
    await withServer(MODELS_CONFIG, async (client) => {
        const audioFile = await toFile(Buffer.from('audio'), 'audio.wav');
        const transcription = await client.audio.transcriptions.create({
            file: audioFile,
            model: 'whisper-1',
            response_format: 'verbose_json',
            prompt: 'hello',
        });
        assert.equal(transcription.text, 'hello');

        const translationFile = await toFile(Buffer.from('audio'), 'audio.wav');
        const translation = await client.audio.translations.create({
            file: translationFile,
            model: 'whisper-1',
            prompt: 'bonjour',
        });
        assert.equal(translation.text, 'bonjour');

        const images = await client.images.generate({
            model: 'gpt-image-1',
            prompt: 'a cat',
            n: 2,
            response_format: 'b64_json',
        });
        assert.equal(images.data.length, 2);
        assert.ok(images.data[0].b64_json);

        const editImage = await toFile(Buffer.from('image'), 'image.png');
        const edit = await client.images.edit({
            image: editImage,
            prompt: 'edit',
        });
        assert.equal(edit.data.length, 1);

        const variationImage = await toFile(Buffer.from('image'), 'image.png');
        const variation = await client.images.createVariation({ image: variationImage });
        assert.equal(variation.data.length, 1);

        const dataFile = await toFile(Buffer.from('file-body'), 'data.jsonl');
        const created = await client.files.create({ file: dataFile, purpose: 'fine-tune' });
        assert.ok(created.id);

        const list = await client.files.list();
        assert.ok(list.data.length >= 1);

        const retrieved = await client.files.retrieve(created.id);
        assert.equal(retrieved.id, created.id);

        const deleted = await client.files.delete(created.id);
        assert.equal(deleted.deleted, true);
    });
});
