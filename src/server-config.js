import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { getDefaultConfigPath } from './paths.js';
import { normalizeModels } from './model-config.js';
import { parseBoolean, parseInteger, parseNumber, readConfigFile } from './utils.js';

const DEFAULT_HOST = '0.0.0.0';
const DEFAULT_PORT = 3000;
const DEFAULT_EMBEDDING_SIZE = 8;
const DEFAULT_LATENCY_MS = 0;
const DEFAULT_ERROR_RATE = 0;
const DEFAULT_BEHAVIOR = 'Echo';
const DEFAULT_TOKEN_COUNTING = 'chars';

export async function buildServerConfig() {
    const configPath = resolveConfigPath();
    const fileConfig = configPath && existsSync(configPath) ? readConfigFile(configPath) : {};
    const configDir = configPath ? dirname(configPath) : process.cwd();
    const modelsConfig = fileConfig?.models || {};
    const modelRegistry = normalizeModels(modelsConfig);

    const config = {
        host: process.env.HOST || fileConfig?.host || DEFAULT_HOST,
        port: parseInteger(process.env.PORT, fileConfig?.port ?? DEFAULT_PORT),
        strictValidation: parseBoolean(process.env.STRICT_VALIDATION, fileConfig?.strict_validation ?? false),
        requireAuth: parseBoolean(process.env.REQUIRE_AUTH, fileConfig?.require_auth ?? false),
        defaultBehavior: process.env.DEFAULT_BEHAVIOR || fileConfig?.default_behavior || DEFAULT_BEHAVIOR,
        embeddingSize: parseInteger(process.env.EMBEDDING_SIZE, fileConfig?.embedding_size ?? DEFAULT_EMBEDDING_SIZE),
        latencyMs: parseInteger(process.env.LATENCY_MS, fileConfig?.latency_ms ?? DEFAULT_LATENCY_MS),
        errorRate: parseNumber(process.env.ERROR_RATE, fileConfig?.error_rate ?? DEFAULT_ERROR_RATE),
        tokenCounting: normalizeTokenCounting(process.env.TOKEN_COUNTING || fileConfig?.token_counting || DEFAULT_TOKEN_COUNTING),
        enableGeminiOpenAiCompat: parseBoolean(
            process.env.ENABLE_GEMINI_OPENAI_COMPAT,
            fileConfig?.enable_gemini_openai_compat ?? false,
        ),
        configPath,
        configDir,
        modelsConfig,
        modelRegistry,
    };

    return { config, fileConfig };
}

function resolveConfigPath() {
    const fromEnv = process.env.LLM_DEBUGGER_CONFIG || process.env.CONFIG_PATH || process.env.CONFIG;
    if (fromEnv) {
        return resolve(fromEnv);
    }
    const defaultPath = getDefaultConfigPath();
    return defaultPath;
}

function normalizeTokenCounting(value) {
    if (!value) return DEFAULT_TOKEN_COUNTING;
    const normalized = String(value).trim().toLowerCase();
    if (normalized === 'words' || normalized === 'word') return 'words';
    return 'chars';
}
