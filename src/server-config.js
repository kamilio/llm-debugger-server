import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { getDefaultConfigPath } from './paths.js';
import { normalizeModels } from './model-config.js';
import { buildConfigValues } from './config-items.js';
import { readConfigFile } from './utils.js';

export async function buildServerConfig() {
    const configPath = resolveConfigPath();
    const fileConfig = configPath && existsSync(configPath) ? readConfigFile(configPath) : {};
    const configDir = configPath ? dirname(configPath) : process.cwd();
    const modelsConfig = fileConfig?.models || {};
    const modelRegistry = normalizeModels(modelsConfig);

    const config = {
        ...buildConfigValues({ env: process.env, fileConfig }),
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
