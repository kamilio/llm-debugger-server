import yaml from 'js-yaml';
import { parseBoolean, parseInteger, parseNumber } from './utils.js';

const DEFAULT_HOST = '0.0.0.0';
const DEFAULT_PORT = 3000;
const DEFAULT_EMBEDDING_SIZE = 8;
const DEFAULT_LATENCY_MS = 0;
const DEFAULT_ERROR_RATE = 0;
const DEFAULT_BEHAVIOR = 'Echo';
const DEFAULT_TOKEN_COUNTING = 'chars';

function normalizeTokenCounting(value) {
    if (!value) return DEFAULT_TOKEN_COUNTING;
    const normalized = String(value).trim().toLowerCase();
    if (normalized === 'words' || normalized === 'word') return 'words';
    return 'chars';
}

function parseString(envValue, fileValue, fallback) {
    if (envValue !== undefined && envValue !== null && envValue !== '') {
        return String(envValue);
    }
    if (fileValue !== undefined && fileValue !== null && fileValue !== '') {
        return fileValue;
    }
    return fallback;
}

function parseBooleanConfig(envValue, fileValue, fallback) {
    return parseBoolean(envValue, fileValue ?? fallback);
}

function parseIntegerConfig(envValue, fileValue, fallback) {
    return parseInteger(envValue, fileValue ?? fallback);
}

function parseNumberConfig(envValue, fileValue, fallback) {
    return parseNumber(envValue, fileValue ?? fallback);
}

function parseTokenCounting(envValue, fileValue, fallback) {
    const raw = envValue || fileValue || fallback;
    return normalizeTokenCounting(raw);
}

export const CONFIG_ITEMS = [
    {
        key: 'host',
        prop: 'host',
        env: 'HOST',
        defaultValue: DEFAULT_HOST,
        note: 'bind address',
        parse: parseString,
    },
    {
        key: 'port',
        prop: 'port',
        env: 'PORT',
        defaultValue: DEFAULT_PORT,
        note: 'HTTP port',
        parse: parseIntegerConfig,
    },
    {
        key: 'strict_validation',
        prop: 'strictValidation',
        env: 'STRICT_VALIDATION',
        defaultValue: false,
        note: 'reject unknown fields',
        parse: parseBooleanConfig,
    },
    {
        key: 'require_auth',
        prop: 'requireAuth',
        env: 'REQUIRE_AUTH',
        defaultValue: false,
        note: 'require API key',
        parse: parseBooleanConfig,
    },
    {
        key: 'default_behavior',
        prop: 'defaultBehavior',
        env: 'DEFAULT_BEHAVIOR',
        defaultValue: DEFAULT_BEHAVIOR,
        note: 'fallback response type',
        parse: parseString,
    },
    {
        key: 'token_counting',
        prop: 'tokenCounting',
        env: 'TOKEN_COUNTING',
        defaultValue: DEFAULT_TOKEN_COUNTING,
        note: 'usage calculation',
        parse: parseTokenCounting,
    },
    {
        key: 'embedding_size',
        prop: 'embeddingSize',
        env: 'EMBEDDING_SIZE',
        defaultValue: DEFAULT_EMBEDDING_SIZE,
        note: 'embedding dimensions',
        parse: parseIntegerConfig,
    },
    {
        key: 'latency_ms',
        prop: 'latencyMs',
        env: 'LATENCY_MS',
        defaultValue: DEFAULT_LATENCY_MS,
        note: 'base response delay',
        parse: parseIntegerConfig,
    },
    {
        key: 'error_rate',
        prop: 'errorRate',
        env: 'ERROR_RATE',
        defaultValue: DEFAULT_ERROR_RATE,
        note: 'random error injection',
        parse: parseNumberConfig,
    },
    {
        key: 'enable_gemini_openai_compat',
        prop: 'enableGeminiOpenAiCompat',
        env: 'ENABLE_GEMINI_OPENAI_COMPAT',
        defaultValue: false,
        note: 'OpenAI-style Gemini endpoints',
        parse: parseBooleanConfig,
    },
];

function formatConfigValue(value) {
    if (typeof value === 'boolean') return value ? 'true' : 'false';
    if (value === null || value === undefined) return '';
    return String(value);
}

function formatYamlValue(value) {
    if (typeof value === 'boolean') return value ? 'true' : 'false';
    if (value === null || value === undefined) return 'null';
    if (typeof value === 'number') return String(value);
    const text = String(value);
    if (/^[a-zA-Z0-9_.-]+$/.test(text)) return text;
    return JSON.stringify(text);
}

export function buildConfigValues({ env, fileConfig }) {
    const values = {};
    for (const item of CONFIG_ITEMS) {
        const envValue = item.env ? env?.[item.env] : undefined;
        const fileValue = fileConfig?.[item.key];
        values[item.prop] = item.parse(envValue, fileValue, item.defaultValue);
    }
    return values;
}

export function buildConfigItems(config) {
    return CONFIG_ITEMS.map((item) => ({
        key: item.key,
        value: formatConfigValue(config?.[item.prop]),
        note: item.note,
    }));
}

export function buildConfigYaml(config, { includeNotes = false } = {}) {
    return CONFIG_ITEMS.map((item) => {
        const value = formatYamlValue(config?.[item.prop]);
        const note = includeNotes && item.note ? `  # ${item.note}` : '';
        return `${item.key}: ${value}${note}`;
    }).join('\n');
}

export function buildFullConfigYaml(config) {
    const payload = {};
    for (const item of CONFIG_ITEMS) {
        payload[item.key] = config?.[item.prop];
    }
    payload.models = config?.modelsConfig || {};
    return yaml.dump(payload, { noRefs: true, lineWidth: 120 });
}

export function buildModelYaml(modelsConfig, modelName) {
    if (!modelsConfig || !Object.prototype.hasOwnProperty.call(modelsConfig, modelName)) {
        return '';
    }
    const payload = { models: { [modelName]: modelsConfig[modelName] } };
    return yaml.dump(payload, { noRefs: true, lineWidth: 120 });
}
