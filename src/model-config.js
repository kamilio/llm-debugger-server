import { toArray } from './utils.js';

export function normalizeModels(modelsConfig = {}) {
    const triggerModels = new Map();
    const behaviorModels = new Map();
    const baseModels = new Set();

    if (!modelsConfig || typeof modelsConfig !== 'object') {
        return { triggerModels, behaviorModels, baseModels };
    }

    for (const [modelName, modelValue] of Object.entries(modelsConfig)) {
        if (Array.isArray(modelValue)) {
            const parsed = parseTriggerList(modelValue, baseModels);
            triggerModels.set(modelName, parsed);
            continue;
        }

        if (typeof modelValue === 'string') {
            const parsed = parseTriggerList([{ _default: modelValue }], baseModels);
            triggerModels.set(modelName, parsed);
            continue;
        }

        if (modelValue && typeof modelValue === 'object') {
            if (Array.isArray(modelValue.triggers)) {
                const parsed = parseTriggerList(modelValue.triggers, baseModels);
                triggerModels.set(modelName, parsed);
                continue;
            }

            if (modelValue.behavior || modelValue.script || modelValue.rules) {
                behaviorModels.set(modelName, {
                    behavior: modelValue.behavior,
                    script: modelValue.script,
                    rules: modelValue.rules,
                });
                continue;
            }

            if ('_default' in modelValue) {
                const parsed = parseTriggerList([{ _default: modelValue._default }], baseModels);
                triggerModels.set(modelName, parsed);
                continue;
            }
        }
    }

    return { triggerModels, behaviorModels, baseModels };
}

function parseTriggerList(list, baseModels) {
    const entries = [];
    let defaultEntry = null;
    let parent = null;

    for (const item of toArray(list)) {
        if (!item || typeof item !== 'object') {
            continue;
        }
        if ('_inherit' in item && !parent) {
            parent = item._inherit;
            if (typeof parent === 'string' && parent) {
                baseModels.add(parent);
            } else {
                parent = null;
            }
            continue;
        }
        if ('_default' in item && !defaultEntry) {
            defaultEntry = { response: item._default };
            continue;
        }

        const keys = Object.keys(item);
        if (keys.length !== 1) {
            continue;
        }
        const match = keys[0];
        entries.push({ match, response: item[match] });
    }

    return { entries, defaultEntry, parent };
}

export function resolveTriggerResponse(modelName, userMessage, registry) {
    const visited = new Set();
    let current = modelName;
    let fallback = null;

    while (current && !visited.has(current)) {
        visited.add(current);
        const model = registry.triggerModels.get(current);
        if (!model) break;

        for (const entry of model.entries) {
            if (entry.match === userMessage) {
                return { response: entry.response, model: current, isDefault: false };
            }
        }

        if (!fallback && model.defaultEntry) {
            fallback = { response: model.defaultEntry.response, model: current, isDefault: true };
        }

        current = model.parent;
    }

    return fallback;
}

export function listModelNames(registry, { excludeBaseModels = true } = {}) {
    const names = new Set();

    for (const name of registry.triggerModels.keys()) {
        if (!name.startsWith('_')) {
            names.add(name);
        }
    }
    for (const name of registry.behaviorModels.keys()) {
        if (!name.startsWith('_')) {
            names.add(name);
        }
    }

    if (excludeBaseModels) {
        for (const base of registry.baseModels) {
            names.delete(base);
        }
    }

    return Array.from(names);
}
