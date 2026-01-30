import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { closeServer, createGeminiModel, startTestServer } from './helpers.js';

const GEMINI_DISCOVERY_URL = 'https://generativelanguage.googleapis.com/$discovery/rest?version=v1beta';
const CACHE_DIR = join(process.cwd(), '.cache');
const SPEC_CACHE_PATH = join(CACHE_DIR, 'gemini-discovery.json');

async function fetchGeminiDiscovery() {
    if (existsSync(SPEC_CACHE_PATH)) {
        const cached = await readFile(SPEC_CACHE_PATH, 'utf-8');
        return JSON.parse(cached);
    }

    const response = await fetch(GEMINI_DISCOVERY_URL);
    if (!response.ok) {
        throw new Error(`Failed to fetch Gemini Discovery doc: ${response.status}`);
    }
    const spec = await response.json();

    await mkdir(CACHE_DIR, { recursive: true });
    await writeFile(SPEC_CACHE_PATH, JSON.stringify(spec, null, 2));

    return spec;
}

function convertDiscoverySchemaToJsonSchema(discoverySchema, allSchemas) {
    if (!discoverySchema || typeof discoverySchema !== 'object') {
        return discoverySchema;
    }

    if (discoverySchema.$ref) {
        const refName = discoverySchema.$ref;
        const refSchema = allSchemas[refName];
        if (refSchema) {
            return convertDiscoverySchemaToJsonSchema(refSchema, allSchemas);
        }
        return {};
    }

    const result = {};

    if (discoverySchema.type) {
        result.type = discoverySchema.type;
    }

    if (discoverySchema.properties) {
        result.properties = {};
        for (const [key, value] of Object.entries(discoverySchema.properties)) {
            result.properties[key] = convertDiscoverySchemaToJsonSchema(value, allSchemas);
        }
    }

    if (discoverySchema.items) {
        result.items = convertDiscoverySchemaToJsonSchema(discoverySchema.items, allSchemas);
    }

    if (discoverySchema.enum) {
        result.enum = discoverySchema.enum;
    }

    if (discoverySchema.format) {
        if (discoverySchema.format === 'int32' || discoverySchema.format === 'int64') {
            result.type = 'integer';
        }
    }

    return result;
}

function assertGeminiUsagePresent(data, context) {
    assert.ok(data.usageMetadata, `${context}: usageMetadata should be present`);
    assert.ok(
        typeof data.usageMetadata.promptTokenCount === 'number',
        `${context}: promptTokenCount should be a number`
    );
    assert.ok(
        typeof data.usageMetadata.candidatesTokenCount === 'number',
        `${context}: candidatesTokenCount should be a number`
    );
    assert.ok(
        typeof data.usageMetadata.totalTokenCount === 'number',
        `${context}: totalTokenCount should be a number`
    );
}

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

test('Gemini generateContent response has correct usageMetadata format', async () => {
    const discovery = await fetchGeminiDiscovery();

    await withServer(MODELS_CONFIG, async (baseUrl) => {
        const model = createGeminiModel(baseUrl, 'echo');
        const result = await model.generateContent('hello');
        const response = result.response;

        assertGeminiUsagePresent(response, 'generateContent');

        const schemas = discovery.schemas || {};
        const usageSchema = convertDiscoverySchemaToJsonSchema(schemas.UsageMetadata, schemas);

        const ajv = new Ajv({ strict: false, allErrors: true });
        addFormats(ajv);

        const validate = ajv.compile(usageSchema);
        const valid = validate(response.usageMetadata);

        if (!valid) {
            console.error('UsageMetadata validation errors:', JSON.stringify(validate.errors, null, 2));
        }
        assert.ok(valid, 'usageMetadata should match UsageMetadata schema');
    });
});

test('Gemini streaming includes usageMetadata', async () => {
    await withServer(MODELS_CONFIG, async (baseUrl) => {
        const response = await fetch(
            `${baseUrl}/v1beta/models/echo:streamGenerateContent?alt=sse`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-goog-api-key': 'test-key',
                },
                body: JSON.stringify({
                    contents: [{ role: 'user', parts: [{ text: 'hello' }] }],
                }),
            }
        );

        const text = await response.text();
        const lines = text.split('\n');

        let hasUsageMetadata = false;
        for (const line of lines) {
            if (line.startsWith('data: ')) {
                const data = line.replace('data: ', '');
                try {
                    const parsed = JSON.parse(data);
                    if (parsed.usageMetadata) {
                        hasUsageMetadata = true;
                        assert.ok(
                            typeof parsed.usageMetadata.promptTokenCount === 'number',
                            'promptTokenCount should be a number'
                        );
                        assert.ok(
                            typeof parsed.usageMetadata.candidatesTokenCount === 'number',
                            'candidatesTokenCount should be a number'
                        );
                        assert.ok(
                            typeof parsed.usageMetadata.totalTokenCount === 'number',
                            'totalTokenCount should be a number'
                        );
                    }
                } catch {
                    // Skip non-JSON lines
                }
            }
        }

        assert.ok(hasUsageMetadata, 'Streaming should include usageMetadata');
    });
});

test('Gemini generateContent response has correct structure', async () => {
    const discovery = await fetchGeminiDiscovery();

    await withServer(MODELS_CONFIG, async (baseUrl) => {
        const model = createGeminiModel(baseUrl, 'echo');
        const result = await model.generateContent('hello');
        const response = result.response;

        assert.ok(response.candidates, 'Response should have candidates');
        assert.ok(Array.isArray(response.candidates), 'candidates should be an array');
        assert.ok(response.candidates.length > 0, 'candidates should not be empty');

        const candidate = response.candidates[0];
        assert.ok(candidate.content, 'Candidate should have content');
        assert.ok(candidate.content.parts, 'Content should have parts');
        assert.ok(Array.isArray(candidate.content.parts), 'parts should be an array');
    });
});
