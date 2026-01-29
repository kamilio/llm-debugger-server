import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import yaml from 'js-yaml';
import { closeServer, createOpenAIClient, startTestServer } from './helpers.js';

const OPENAI_SPEC_URL = 'https://app.stainless.com/api/spec/documented/openai/openapi.documented.yml';
const CACHE_DIR = join(process.cwd(), '.cache');
const SPEC_CACHE_PATH = join(CACHE_DIR, 'openai-openapi.yml');

async function fetchOpenAISpec() {
    if (existsSync(SPEC_CACHE_PATH)) {
        const cached = await readFile(SPEC_CACHE_PATH, 'utf-8');
        return yaml.load(cached);
    }

    const response = await fetch(OPENAI_SPEC_URL);
    if (!response.ok) {
        throw new Error(`Failed to fetch OpenAI spec: ${response.status}`);
    }
    const text = await response.text();

    await mkdir(CACHE_DIR, { recursive: true });
    await writeFile(SPEC_CACHE_PATH, text);

    return yaml.load(text);
}

function createValidator(spec) {
    const ajv = new Ajv({
        strict: false,
        allErrors: true,
        validateFormats: false,
    });
    addFormats(ajv);

    const schemas = spec.components?.schemas || {};
    for (const [name, schema] of Object.entries(schemas)) {
        try {
            ajv.addSchema({ ...schema, $id: `#/components/schemas/${name}` });
        } catch {
            // Some schemas may have conflicts, skip them
        }
    }

    return ajv;
}

function resolveRefs(schema, schemas) {
    if (!schema || typeof schema !== 'object') return schema;

    if (schema.$ref) {
        const refPath = schema.$ref.replace('#/components/schemas/', '');
        const resolved = schemas[refPath];
        if (resolved) {
            return resolveRefs(resolved, schemas);
        }
        return schema;
    }

    if (Array.isArray(schema)) {
        return schema.map(item => resolveRefs(item, schemas));
    }

    const result = {};
    for (const [key, value] of Object.entries(schema)) {
        result[key] = resolveRefs(value, schemas);
    }
    return result;
}

function validateAgainstSchema(data, schemaName, spec) {
    const schemas = spec.components?.schemas || {};
    const schema = schemas[schemaName];
    if (!schema) {
        throw new Error(`Schema ${schemaName} not found in spec`);
    }

    const resolvedSchema = resolveRefs(schema, schemas);

    const ajv = new Ajv({
        strict: false,
        allErrors: true,
        validateFormats: false,
    });
    addFormats(ajv);

    const validate = ajv.compile(resolvedSchema);
    const valid = validate(data);

    return {
        valid,
        errors: validate.errors,
    };
}

function assertUsagePresent(data, context) {
    assert.ok(data.usage, `${context}: usage should be present`);
    assert.ok(typeof data.usage.prompt_tokens === 'number', `${context}: prompt_tokens should be a number`);
    assert.ok(typeof data.usage.completion_tokens === 'number', `${context}: completion_tokens should be a number`);
    assert.ok(typeof data.usage.total_tokens === 'number', `${context}: total_tokens should be a number`);
}

async function withServer(modelsConfig, run) {
    const { server, baseUrl } = await startTestServer({ modelsConfig });
    try {
        await run(createOpenAIClient(baseUrl), baseUrl);
    } finally {
        await closeServer(server);
    }
}

const MODELS_CONFIG = {
    echo: [{ _default: { type: 'echo' } }],
};

test('OpenAI chat completion response has correct usage format', async () => {
    const spec = await fetchOpenAISpec();

    await withServer(MODELS_CONFIG, async (client) => {
        const response = await client.chat.completions.create({
            model: 'echo',
            messages: [{ role: 'user', content: 'hello' }],
        });

        assertUsagePresent(response, 'chat completion');

        const result = validateAgainstSchema(response, 'CreateChatCompletionResponse', spec);
        if (!result.valid) {
            console.error('Validation errors:', JSON.stringify(result.errors, null, 2));
        }
        assert.ok(result.valid, `Response should match CreateChatCompletionResponse schema`);
    });
});

test('OpenAI chat completion streaming includes usage chunk', async () => {
    await withServer(MODELS_CONFIG, async (client) => {
        const stream = await client.chat.completions.create({
            model: 'echo',
            messages: [{ role: 'user', content: 'hello' }],
            stream: true,
        });

        let usageChunk = null;
        for await (const chunk of stream) {
            if (chunk.usage) {
                usageChunk = chunk;
            }
        }

        assert.ok(usageChunk, 'Streaming should include a usage chunk');
        assertUsagePresent(usageChunk, 'streaming usage chunk');
    });
});

test('OpenAI chat completion streaming can disable usage with stream_options', async () => {
    await withServer(MODELS_CONFIG, async (client, baseUrl) => {
        const response = await fetch(`${baseUrl}/v1/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer test-key',
            },
            body: JSON.stringify({
                model: 'echo',
                messages: [{ role: 'user', content: 'hello' }],
                stream: true,
                stream_options: { include_usage: false },
            }),
        });

        const text = await response.text();
        const lines = text.split('\n').filter(line => line.startsWith('data: '));

        let hasUsage = false;
        for (const line of lines) {
            const data = line.replace('data: ', '');
            if (data === '[DONE]') continue;
            const chunk = JSON.parse(data);
            if (chunk.usage) {
                hasUsage = true;
            }
        }

        assert.ok(!hasUsage, 'Streaming with include_usage: false should not include usage chunk');
    });
});

test('OpenAI completions response has correct usage format', async () => {
    const spec = await fetchOpenAISpec();

    await withServer(MODELS_CONFIG, async (client, baseUrl) => {
        const response = await fetch(`${baseUrl}/v1/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer test-key',
            },
            body: JSON.stringify({
                model: 'echo',
                prompt: 'hello',
            }),
        });

        const data = await response.json();

        assertUsagePresent(data, 'completions');

        const result = validateAgainstSchema(data, 'CreateCompletionResponse', spec);
        if (!result.valid) {
            console.error('Validation errors:', JSON.stringify(result.errors, null, 2));
        }
        assert.ok(result.valid, `Response should match CreateCompletionResponse schema`);
    });
});

test('OpenAI embeddings response has correct usage format', async () => {
    const spec = await fetchOpenAISpec();

    await withServer(MODELS_CONFIG, async (client) => {
        const response = await client.embeddings.create({
            model: 'echo',
            input: ['hello'],
        });

        assert.ok(response.usage, 'embeddings: usage should be present');
        assert.ok(typeof response.usage.prompt_tokens === 'number', 'embeddings: prompt_tokens should be a number');
        assert.ok(typeof response.usage.total_tokens === 'number', 'embeddings: total_tokens should be a number');

        const result = validateAgainstSchema(response, 'CreateEmbeddingResponse', spec);
        if (!result.valid) {
            console.error('Validation errors:', JSON.stringify(result.errors, null, 2));
        }
        assert.ok(result.valid, `Response should match CreateEmbeddingResponse schema`);
    });
});

test('OpenAI responses API has correct usage format', async () => {
    await withServer(MODELS_CONFIG, async (client) => {
        const response = await client.responses.create({
            model: 'echo',
            input: 'hello',
        });

        assert.ok(response.usage, 'responses API: usage should be present');
        assert.ok(typeof response.usage.input_tokens === 'number', 'responses API: input_tokens should be a number');
        assert.ok(typeof response.usage.output_tokens === 'number', 'responses API: output_tokens should be a number');
        assert.ok(typeof response.usage.total_tokens === 'number', 'responses API: total_tokens should be a number');
    });
});

test('OpenAI responses API streaming includes usage in completed event', async () => {
    await withServer(MODELS_CONFIG, async (client) => {
        const stream = await client.responses.create({
            model: 'echo',
            input: 'hello',
            stream: true,
        });

        let completedEvent = null;
        for await (const event of stream) {
            if (event.type === 'response.completed') {
                completedEvent = event;
            }
        }

        assert.ok(completedEvent, 'Streaming should include response.completed event');
        assert.ok(completedEvent.usage, 'Completed event should include usage');
        assert.ok(typeof completedEvent.usage.input_tokens === 'number', 'input_tokens should be a number');
        assert.ok(typeof completedEvent.usage.output_tokens === 'number', 'output_tokens should be a number');
    });
});
