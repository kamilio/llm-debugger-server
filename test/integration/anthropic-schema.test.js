import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { closeServer, createAnthropicClient, startTestServer } from './helpers.js';

const ANTHROPIC_SPEC_URL = 'https://storage.googleapis.com/stainless-sdk-openapi-specs/anthropic%2Fanthropic-4526612d12e919de063708c05d15b78902b5a52d33a6e3eb45708c562d338b18.yml';
const CACHE_DIR = join(process.cwd(), '.cache');
const SPEC_CACHE_PATH = join(CACHE_DIR, 'anthropic-openapi.json');

async function fetchAnthropicSpec() {
    if (existsSync(SPEC_CACHE_PATH)) {
        const cached = await readFile(SPEC_CACHE_PATH, 'utf-8');
        return JSON.parse(cached);
    }

    const response = await fetch(ANTHROPIC_SPEC_URL);
    if (!response.ok) {
        throw new Error(`Failed to fetch Anthropic spec: ${response.status}`);
    }
    const spec = await response.json();

    await mkdir(CACHE_DIR, { recursive: true });
    await writeFile(SPEC_CACHE_PATH, JSON.stringify(spec, null, 2));

    return spec;
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

    if (schema.anyOf) {
        return { anyOf: schema.anyOf.map(s => resolveRefs(s, schemas)) };
    }

    if (schema.oneOf) {
        return { oneOf: schema.oneOf.map(s => resolveRefs(s, schemas)) };
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

function assertAnthropicUsagePresent(data, context) {
    assert.ok(data.usage, `${context}: usage should be present`);
    assert.ok(typeof data.usage.input_tokens === 'number', `${context}: input_tokens should be a number`);
    assert.ok(typeof data.usage.output_tokens === 'number', `${context}: output_tokens should be a number`);
}

async function withServer(modelsConfig, run) {
    const { server, baseUrl } = await startTestServer({ modelsConfig });
    try {
        await run(createAnthropicClient(baseUrl), baseUrl);
    } finally {
        await closeServer(server);
    }
}

const MODELS_CONFIG = {
    echo: [{ _default: { type: 'echo' } }],
};

test('Anthropic message response has correct usage format', async () => {
    const spec = await fetchAnthropicSpec();

    await withServer(MODELS_CONFIG, async (client) => {
        const message = await client.messages.create({
            model: 'echo',
            max_tokens: 16,
            messages: [{ role: 'user', content: [{ type: 'text', text: 'hello' }] }],
        });

        assertAnthropicUsagePresent(message, 'messages');

        const result = validateAgainstSchema(message, 'Message', spec);
        if (!result.valid) {
            console.error('Validation errors:', JSON.stringify(result.errors, null, 2));
        }
        assert.ok(result.valid, `Response should match Message schema`);
    });
});

test('Anthropic streaming includes usage in message_delta', async () => {
    await withServer(MODELS_CONFIG, async (client, baseUrl) => {
        const response = await fetch(`${baseUrl}/v1/messages`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': 'test-key',
                'anthropic-version': '2023-06-01',
            },
            body: JSON.stringify({
                model: 'echo',
                max_tokens: 16,
                messages: [{ role: 'user', content: 'hello' }],
                stream: true,
            }),
        });

        const text = await response.text();
        const lines = text.split('\n');

        let messageDeltaEvent = null;
        for (const line of lines) {
            if (line.startsWith('data: ')) {
                const data = line.replace('data: ', '');
                try {
                    const parsed = JSON.parse(data);
                    if (parsed.type === 'message_delta') {
                        messageDeltaEvent = parsed;
                    }
                } catch {
                    // Skip non-JSON lines
                }
            }
        }

        assert.ok(messageDeltaEvent, 'Streaming should include message_delta event');
        assert.ok(messageDeltaEvent.usage, 'message_delta should include usage');
        assert.ok(typeof messageDeltaEvent.usage.output_tokens === 'number', 'output_tokens should be a number');
    });
});

test('Anthropic streaming includes usage in message_start', async () => {
    await withServer(MODELS_CONFIG, async (client, baseUrl) => {
        const response = await fetch(`${baseUrl}/v1/messages`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': 'test-key',
                'anthropic-version': '2023-06-01',
            },
            body: JSON.stringify({
                model: 'echo',
                max_tokens: 16,
                messages: [{ role: 'user', content: 'hello' }],
                stream: true,
            }),
        });

        const text = await response.text();
        const lines = text.split('\n');

        let messageStartEvent = null;
        for (const line of lines) {
            if (line.startsWith('data: ')) {
                const data = line.replace('data: ', '');
                try {
                    const parsed = JSON.parse(data);
                    if (parsed.type === 'message_start') {
                        messageStartEvent = parsed;
                    }
                } catch {
                    // Skip non-JSON lines
                }
            }
        }

        assert.ok(messageStartEvent, 'Streaming should include message_start event');
        assert.ok(messageStartEvent.message, 'message_start should include message');
        assert.ok(messageStartEvent.message.usage, 'message should include usage');
        assert.ok(typeof messageStartEvent.message.usage.input_tokens === 'number', 'input_tokens should be a number');
    });
});
