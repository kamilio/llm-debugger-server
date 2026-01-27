import { readFileSync } from 'node:fs';
import { extname } from 'node:path';
import yaml from 'js-yaml';
import { resolveTriggerResponse } from './model-config.js';
import { combineTokens, countTokens, generateId, resolvePath, safeJsonParse } from './utils.js';

const BUILTIN_BEHAVIORS = new Set(['echo', 'robot', 'weirdo', 'thinker']);

export async function resolveResponse({
    config,
    modelName,
    inputText,
    lastUserMessage,
    requestBody,
    headers,
}) {
    const headerBehavior = headers['x-behavior'];
    if (headerBehavior) {
        const behavior = String(headerBehavior).trim();
        return buildBehaviorResponse({ config, behavior, inputText, lastUserMessage, requestBody, headers });
    }

    const triggerMatch = resolveTriggerResponse(modelName, lastUserMessage, config.modelRegistry);
    if (triggerMatch) {
        return buildDirectiveResponse({
            config,
            directive: triggerMatch.response,
            inputText,
            lastUserMessage,
            requestBody,
            headers,
            behaviorName: `config:${triggerMatch.model}`,
        });
    }

    const behaviorEntry = config.modelRegistry.behaviorModels.get(modelName);
    if (behaviorEntry) {
        const behavior = behaviorEntry.behavior || modelName;
        return buildBehaviorResponse({
            config,
            behavior,
            inputText,
            lastUserMessage,
            requestBody,
            headers,
            behaviorEntry,
        });
    }

    if (BUILTIN_BEHAVIORS.has(String(modelName).toLowerCase())) {
        return buildBehaviorResponse({ config, behavior: modelName, inputText, lastUserMessage, requestBody, headers });
    }

    return buildBehaviorResponse({
        config,
        behavior: config.defaultBehavior,
        inputText,
        lastUserMessage,
        requestBody,
        headers,
    });
}

function buildDirectiveResponse({ config, directive, inputText, lastUserMessage, requestBody, headers, behaviorName }) {
    const resolved = normalizeDirective(directive);
    if (resolved.type === 'file') {
        return {
            mode: 'file',
            file: loadFixtureResponse(resolved.path, config.configDir),
            behavior: behaviorName,
        };
    }

    if (resolved.type === 'error') {
        return {
            mode: 'error',
            error: {
                status: resolved.status || 500,
                message: resolved.message || 'Error',
            },
            behavior: behaviorName,
        };
    }

    if (resolved.type === 'echo') {
        const response = {
            content: lastUserMessage || inputText || '',
        };
        attachToolCalls(response, requestBody, headers, lastUserMessage || inputText);
        const usage = buildUsage({
            response,
            inputText,
            lastUserMessage,
            usageOverrides: resolved.usage,
            tokenCounting: config.tokenCounting,
        });
        response.usage = usage;
        return { mode: 'canonical', response, behavior: behaviorName };
    }

    if (resolved.type === 'message') {
        const response = {
            content: resolved.content ?? '',
            reasoning: resolved.reasoning,
            tool_calls: normalizeToolCalls(resolved.tool_calls),
        };
        attachToolCalls(response, requestBody, headers, lastUserMessage || inputText);
        const usage = buildUsage({
            response,
            inputText,
            lastUserMessage,
            usageOverrides: resolved.usage,
            tokenCounting: config.tokenCounting,
        });
        response.usage = usage;
        return { mode: 'canonical', response, behavior: behaviorName };
    }

    const response = {
        content: String(resolved.content ?? resolved),
    };
    attachToolCalls(response, requestBody, headers, lastUserMessage || inputText);
    response.usage = buildUsage({
        response,
        inputText,
        lastUserMessage,
        usageOverrides: resolved.usage,
        tokenCounting: config.tokenCounting,
    });
    return { mode: 'canonical', response, behavior: behaviorName };
}

function buildBehaviorResponse({ config, behavior, inputText, lastUserMessage, requestBody, headers, behaviorEntry }) {
    const normalized = String(behavior || config.defaultBehavior || 'Echo').trim();
    const behaviorKey = normalized.toLowerCase();

    if (behaviorKey === 'robot') {
        const script = resolveRobotScript({ behaviorEntry, config });
        const resultText = matchRobotScript(script, lastUserMessage || inputText || '');
        const response = { content: resultText };
        attachToolCalls(response, requestBody, headers, lastUserMessage || inputText);
        response.usage = buildUsage({
            response,
            inputText,
            lastUserMessage,
            tokenCounting: config.tokenCounting,
        });
        return { mode: 'canonical', response, behavior: normalized };
    }

    if (behaviorKey === 'weirdo') {
        const response = {
            content: 'asdkjhasd kajshd aksjdh asdkjhasd kajshd aksjdh',
        };
        attachToolCalls(response, requestBody, headers, lastUserMessage || inputText);
        response.usage = buildUsage({
            response,
            inputText,
            lastUserMessage,
            usageOverrides: { output: 999999 },
            tokenCounting: config.tokenCounting,
        });
        return { mode: 'canonical', response, behavior: normalized };
    }

    if (behaviorKey === 'thinker') {
        const response = {
            content: 'Here is my thoughtful response.',
            reasoning: 'Thinking through the problem in a concise summary.',
        };
        attachToolCalls(response, requestBody, headers, lastUserMessage || inputText);
        response.usage = buildUsage({
            response,
            inputText,
            lastUserMessage,
            tokenCounting: config.tokenCounting,
        });
        return { mode: 'canonical', response, behavior: normalized };
    }

    const response = {
        content: lastUserMessage || inputText || '',
    };
    attachToolCalls(response, requestBody, headers, lastUserMessage || inputText);
    response.usage = buildUsage({
        response,
        inputText,
        lastUserMessage,
        tokenCounting: config.tokenCounting,
    });

    return { mode: 'canonical', response, behavior: normalized };
}

function normalizeDirective(directive) {
    if (typeof directive === 'string') {
        return { type: 'message', content: directive };
    }
    if (!directive || typeof directive !== 'object') {
        return { type: 'message', content: String(directive ?? '') };
    }
    return directive;
}

function buildUsage({ response, inputText, lastUserMessage, usageOverrides, tokenCounting }) {
    const inputTokens = combineTokens(inputText, tokenCounting);
    const outputTokens = combineTokens(
        [response.content, response.reasoning],
        tokenCounting,
    );

    const usage = {
        input: usageOverrides?.input ?? inputTokens,
        output: usageOverrides?.output ?? outputTokens,
    };

    if (usageOverrides?.reasoning !== undefined) {
        usage.reasoning = usageOverrides.reasoning;
    } else if (response.reasoning) {
        usage.reasoning = countTokens(response.reasoning, tokenCounting);
    }

    if (usageOverrides?.cache_read !== undefined) {
        usage.cache_read = usageOverrides.cache_read;
    }
    if (usageOverrides?.cache_creation !== undefined) {
        usage.cache_creation = usageOverrides.cache_creation;
    }

    return usage;
}

function resolveRobotScript({ behaviorEntry, config }) {
    if (behaviorEntry?.rules) {
        return behaviorEntry;
    }
    const scriptPath = behaviorEntry?.script || config?.modelsConfig?.Robot?.script;
    if (!scriptPath) {
        return null;
    }
    const resolved = resolvePath(config.configDir, scriptPath);
    if (!resolved) return null;
    const raw = readFileSync(resolved, 'utf-8');
    if (extname(resolved).toLowerCase() === '.json') {
        return JSON.parse(raw);
    }
    return yaml.load(raw);
}

function matchRobotScript(script, userInput) {
    if (!script || !Array.isArray(script.rules)) {
        return script?.fallback || userInput || '';
    }
    for (const rule of script.rules) {
        const match = rule?.match;
        if (!match) continue;
        if (isRegexMatch(match, userInput)) {
            return rule.response ?? script.fallback ?? '';
        }
        if (match === userInput) {
            return rule.response ?? script.fallback ?? '';
        }
    }
    return script.fallback || '';
}

function isRegexMatch(pattern, userInput) {
    if (typeof pattern !== 'string') return false;
    if (!pattern.startsWith('/') || pattern.lastIndexOf('/') === 0) return false;
    const lastSlash = pattern.lastIndexOf('/');
    const body = pattern.slice(1, lastSlash);
    const flags = pattern.slice(lastSlash + 1);
    try {
        const regex = new RegExp(body, flags);
        return regex.test(userInput);
    } catch {
        return false;
    }
}

function buildToolCallsFromRequest({ requestBody, headers, userInput }) {
    const toolHeader = headers['x-tool-result'];
    const forcedArgs = safeJsonParse(toolHeader);

    const toolChoice = requestBody?.tool_choice || requestBody?.toolChoice;
    const tools = requestBody?.tools || requestBody?.functions;

    const toolName = resolveToolName(toolChoice, tools);
    if (!toolName) return [];

    const args = forcedArgs || { input: userInput || '' };
    return [
        {
            id: generateId('tool'),
            name: toolName,
            arguments: args,
        },
    ];
}

function resolveToolName(toolChoice, tools) {
    if (toolChoice === 'none') return null;
    if (toolChoice?.function?.name) return toolChoice.function.name;
    if (typeof toolChoice === 'string' && toolChoice !== 'auto' && toolChoice !== 'required') {
        return toolChoice;
    }

    if (Array.isArray(tools) && tools.length > 0) {
        const first = tools[0];
        if (first?.function?.name) return first.function.name;
        if (first?.name) return first.name;
    }

    return null;
}

function normalizeToolCalls(toolCalls) {
    if (!toolCalls) return undefined;
    return toolCalls.map((call) => ({
        id: call.id || generateId('tool'),
        name: call.name,
        arguments: call.arguments ?? call.args ?? {},
    }));
}

function attachToolCalls(response, requestBody, headers, userInput) {
    if (response.tool_calls && response.tool_calls.length) return;
    const toolCalls = buildToolCallsFromRequest({ requestBody, headers, userInput });
    if (toolCalls.length) {
        response.tool_calls = toolCalls;
    }
}

function loadFixtureResponse(filePath, baseDir) {
    const resolved = resolvePath(baseDir, filePath);
    if (!resolved) {
        return { error: new Error('Invalid fixture path.') };
    }
    const raw = readFileSync(resolved, 'utf-8');
    const ext = extname(resolved).toLowerCase();
    const parsed = ext === '.json' ? JSON.parse(raw) : yaml.load(raw);
    return parsed;
}
