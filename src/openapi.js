const OPENAPI_VERSION = '3.0.3';
const API_VERSION = '1.0.0';

const TAGS = [
    { name: 'core', description: 'Core server endpoints.' },
    { name: 'openai', description: 'OpenAI-compatible endpoints.' },
    { name: 'anthropic', description: 'Anthropic-compatible endpoints.' },
    { name: 'gemini', description: 'Gemini native endpoints.' },
    { name: 'gemini-openai', description: 'Gemini OpenAI-compat endpoints.' },
];

const PROVIDER_HEADER_PARAM = {
    name: 'x-provider',
    in: 'header',
    required: false,
    schema: { type: 'string', enum: ['anthropic'] },
    description: 'Use "anthropic" to return Anthropic-compatible shapes.',
};

const MODEL_PARAM = {
    name: 'model',
    in: 'path',
    required: true,
    schema: { type: 'string' },
};

const FILE_ID_PARAM = {
    name: 'fileId',
    in: 'path',
    required: true,
    schema: { type: 'string' },
};

const STREAM_FORMAT_PARAM = {
    name: 'stream_format',
    in: 'query',
    required: false,
    schema: { type: 'string', enum: ['ndjson'] },
    description: 'Use "ndjson" to stream as application/x-ndjson.',
};

function jsonSchema() {
    return { type: 'object' };
}

function textSchema() {
    return { type: 'string' };
}

function jsonRequestBody() {
    return {
        required: true,
        content: {
            'application/json': { schema: jsonSchema() },
        },
    };
}

function multipartRequestBody(schema = jsonSchema()) {
    return {
        required: true,
        content: {
            'multipart/form-data': { schema },
        },
    };
}

function jsonResponse() {
    return {
        description: 'OK',
        content: {
            'application/json': { schema: jsonSchema() },
        },
    };
}

function htmlResponse() {
    return {
        description: 'OK',
        content: {
            'text/html': { schema: textSchema() },
        },
    };
}

function jsonHtmlResponse() {
    return {
        description: 'OK',
        content: {
            'application/json': { schema: jsonSchema() },
            'text/html': { schema: textSchema() },
        },
    };
}

function yamlResponse() {
    return {
        description: 'OK',
        content: {
            'application/yaml': { schema: textSchema() },
        },
    };
}

function jsonOrStreamResponse() {
    return {
        description: 'OK',
        content: {
            'application/json': { schema: jsonSchema() },
            'text/event-stream': { schema: textSchema() },
        },
    };
}

function streamResponse() {
    return {
        description: 'OK',
        content: {
            'text/event-stream': { schema: textSchema() },
            'application/x-ndjson': { schema: textSchema() },
        },
    };
}

function openApiOperation({ tags, summary, requestBody, parameters, responses }) {
    return {
        tags,
        summary,
        ...(requestBody ? { requestBody } : {}),
        ...(parameters ? { parameters } : {}),
        responses,
    };
}

function buildOpenAiCompatPaths(prefix) {
    const prefixed = (path) => `${prefix}${path}`;

    return {
        [prefixed('/models')]: {
            get: openApiOperation({
                tags: ['openai', 'anthropic'],
                summary: 'List models.',
                parameters: [PROVIDER_HEADER_PARAM],
                responses: { 200: jsonResponse() },
            }),
        },
        [prefixed('/models/{model}')]: {
            get: openApiOperation({
                tags: ['openai', 'anthropic'],
                summary: 'Retrieve a model.',
                parameters: [MODEL_PARAM, PROVIDER_HEADER_PARAM],
                responses: { 200: jsonResponse() },
            }),
        },
        [prefixed('/chat/completions')]: {
            post: openApiOperation({
                tags: ['openai'],
                summary: 'Create a chat completion.',
                requestBody: jsonRequestBody(),
                responses: { 200: jsonOrStreamResponse() },
            }),
        },
        [prefixed('/completions')]: {
            post: openApiOperation({
                tags: ['openai'],
                summary: 'Create a completion.',
                requestBody: jsonRequestBody(),
                responses: { 200: jsonOrStreamResponse() },
            }),
        },
        [prefixed('/embeddings')]: {
            post: openApiOperation({
                tags: ['openai'],
                summary: 'Create embeddings.',
                requestBody: jsonRequestBody(),
                responses: { 200: jsonResponse() },
            }),
        },
        [prefixed('/responses')]: {
            post: openApiOperation({
                tags: ['openai'],
                summary: 'Create a response.',
                requestBody: jsonRequestBody(),
                responses: { 200: jsonOrStreamResponse() },
            }),
        },
        [prefixed('/audio/transcriptions')]: {
            post: openApiOperation({
                tags: ['openai'],
                summary: 'Create a transcription.',
                requestBody: multipartRequestBody(),
                responses: { 200: jsonResponse() },
            }),
        },
        [prefixed('/audio/translations')]: {
            post: openApiOperation({
                tags: ['openai'],
                summary: 'Create a translation.',
                requestBody: multipartRequestBody(),
                responses: { 200: jsonResponse() },
            }),
        },
        [prefixed('/images/generations')]: {
            post: openApiOperation({
                tags: ['openai'],
                summary: 'Generate an image.',
                requestBody: jsonRequestBody(),
                responses: { 200: jsonResponse() },
            }),
        },
        [prefixed('/images/edits')]: {
            post: openApiOperation({
                tags: ['openai'],
                summary: 'Edit an image.',
                requestBody: multipartRequestBody(),
                responses: { 200: jsonResponse() },
            }),
        },
        [prefixed('/images/variations')]: {
            post: openApiOperation({
                tags: ['openai'],
                summary: 'Create image variations.',
                requestBody: multipartRequestBody(),
                responses: { 200: jsonResponse() },
            }),
        },
        [prefixed('/moderations')]: {
            post: openApiOperation({
                tags: ['openai'],
                summary: 'Create a moderation.',
                requestBody: jsonRequestBody(),
                responses: { 200: jsonResponse() },
            }),
        },
        [prefixed('/files')]: {
            post: openApiOperation({
                tags: ['openai'],
                summary: 'Upload a file.',
                requestBody: multipartRequestBody({
                    type: 'object',
                    properties: {
                        file: { type: 'string', format: 'binary' },
                        purpose: { type: 'string' },
                    },
                    required: ['file'],
                }),
                responses: { 200: jsonResponse() },
            }),
            get: openApiOperation({
                tags: ['openai'],
                summary: 'List files.',
                responses: { 200: jsonResponse() },
            }),
        },
        [prefixed('/files/{fileId}')]: {
            get: openApiOperation({
                tags: ['openai'],
                summary: 'Retrieve a file.',
                parameters: [FILE_ID_PARAM],
                responses: { 200: jsonResponse() },
            }),
            delete: openApiOperation({
                tags: ['openai'],
                summary: 'Delete a file.',
                parameters: [FILE_ID_PARAM],
                responses: { 200: jsonResponse() },
            }),
        },
    };
}

export function buildOpenApiSpec(config, { serverUrl } = {}) {
    const spec = {
        openapi: OPENAPI_VERSION,
        info: {
            title: 'LLM Debugger Server',
            version: API_VERSION,
            description: 'Dummy multi-provider AI API server for local testing.',
        },
        servers:
            serverUrl
                ? [{ url: serverUrl }]
                : [
                    {
                        url: 'http://{host}:{port}',
                        variables: {
                            host: { default: config.host },
                            port: { default: String(config.port) },
                        },
                    },
                ],
        tags: TAGS,
        paths: {
            '/': {
                get: openApiOperation({
                    tags: ['core'],
                    summary: 'List available endpoints.',
                    responses: { 200: jsonHtmlResponse() },
                }),
            },
            '/health': {
                get: openApiOperation({
                    tags: ['core'],
                    summary: 'Health check.',
                    responses: { 200: jsonResponse() },
                }),
            },
            '/__viewer__': {
                get: openApiOperation({
                    tags: ['core'],
                    summary: 'Simple HTML viewer.',
                    responses: { 200: htmlResponse() },
                }),
            },
            '/playground': {
                get: openApiOperation({
                    tags: ['core'],
                    summary: 'Streaming playground.',
                    responses: { 200: htmlResponse() },
                }),
            },
            '/explore': {
                get: openApiOperation({
                    tags: ['core'],
                    summary: 'Config explorer.',
                    responses: { 200: htmlResponse() },
                }),
            },
            '/openapi.json': {
                get: openApiOperation({
                    tags: ['core'],
                    summary: 'OpenAPI specification (JSON).',
                    responses: { 200: jsonResponse() },
                }),
            },
            '/openapi.yaml': {
                get: openApiOperation({
                    tags: ['core'],
                    summary: 'OpenAPI specification (YAML).',
                    responses: { 200: yamlResponse() },
                }),
            },
            ...buildOpenAiCompatPaths('/v1'),
            '/v1/messages': {
                post: openApiOperation({
                    tags: ['anthropic'],
                    summary: 'Create a message.',
                    requestBody: jsonRequestBody(),
                    responses: { 200: jsonOrStreamResponse() },
                }),
            },
            '/v1/messages/count_tokens': {
                post: openApiOperation({
                    tags: ['anthropic'],
                    summary: 'Count tokens for messages.',
                    requestBody: jsonRequestBody(),
                    responses: { 200: jsonResponse() },
                }),
            },
            '/v1beta/models': {
                get: openApiOperation({
                    tags: ['gemini'],
                    summary: 'List Gemini models.',
                    responses: { 200: jsonResponse() },
                }),
            },
            '/v1beta/models/{model}': {
                get: openApiOperation({
                    tags: ['gemini'],
                    summary: 'Retrieve a Gemini model.',
                    parameters: [MODEL_PARAM],
                    responses: { 200: jsonResponse() },
                }),
            },
            '/v1beta/models/{model}:generateContent': {
                post: openApiOperation({
                    tags: ['gemini'],
                    summary: 'Generate content.',
                    parameters: [MODEL_PARAM],
                    requestBody: jsonRequestBody(),
                    responses: { 200: jsonResponse() },
                }),
            },
            '/v1beta/models/{model}:streamGenerateContent': {
                post: openApiOperation({
                    tags: ['gemini'],
                    summary: 'Stream generated content.',
                    parameters: [MODEL_PARAM, STREAM_FORMAT_PARAM],
                    requestBody: jsonRequestBody(),
                    responses: { 200: streamResponse() },
                }),
            },
            '/v1beta/models/{model}:countTokens': {
                post: openApiOperation({
                    tags: ['gemini'],
                    summary: 'Count tokens.',
                    parameters: [MODEL_PARAM],
                    requestBody: jsonRequestBody(),
                    responses: { 200: jsonResponse() },
                }),
            },
        },
        components: {
            securitySchemes: {
                BearerAuth: { type: 'http', scheme: 'bearer' },
                ApiKeyAuth: { type: 'apiKey', in: 'header', name: 'x-api-key' },
                GoogleApiKey: { type: 'apiKey', in: 'header', name: 'x-goog-api-key' },
            },
        },
    };

    if (config.enableGeminiOpenAiCompat) {
        Object.assign(spec.paths, buildOpenAiCompatPaths('/v1beta/openai'));
    }

    return spec;
}
