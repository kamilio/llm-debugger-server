import { generateId, nowSeconds } from './utils.js';

export function buildOpenAIChatResponse({ response, model }) {
    const id = generateId('chatcmpl');
    const created = nowSeconds();
    const usage = mapUsageToOpenAIChat(response.usage);
    const toolCalls = response.tool_calls ? toOpenAIToolCalls(response.tool_calls) : undefined;

    return {
        id,
        object: 'chat.completion',
        created,
        model,
        choices: [
            {
                index: 0,
                message: {
                    role: 'assistant',
                    content: response.content ?? '',
                    ...(response.reasoning ? { reasoning_content: response.reasoning } : {}),
                    ...(toolCalls ? { tool_calls: toolCalls } : {}),
                },
                finish_reason: 'stop',
            },
        ],
        usage,
    };
}

export function buildOpenAIChatStreamEvents({ response, model, includeUsage }) {
    const id = generateId('chatcmpl');
    const created = nowSeconds();
    const toolCalls = response.tool_calls ? toOpenAIToolCalls(response.tool_calls) : undefined;

    const delta = {
        role: 'assistant',
        ...(response.content ? { content: response.content } : {}),
        ...(response.reasoning ? { reasoning_content: response.reasoning } : {}),
        ...(toolCalls ? { tool_calls: toolCalls } : {}),
    };

    const events = [
        {
            data: {
                id,
                object: 'chat.completion.chunk',
                created,
                model,
                choices: [
                    {
                        index: 0,
                        delta,
                        finish_reason: null,
                    },
                ],
            },
        },
        {
            data: {
                id,
                object: 'chat.completion.chunk',
                created,
                model,
                choices: [
                    {
                        index: 0,
                        delta: {},
                        finish_reason: 'stop',
                    },
                ],
            },
        },
    ];

    if (includeUsage) {
        events.push({
            data: {
                id,
                object: 'chat.completion.chunk',
                created,
                model,
                choices: [],
                usage: mapUsageToOpenAIChat(response.usage),
            },
        });
    }

    events.push({ data: '[DONE]' });
    return events;
}

export function buildOpenAICompletionResponse({ text, model, usage }) {
    const id = generateId('cmpl');
    const created = nowSeconds();

    return {
        id,
        object: 'text_completion',
        created,
        model,
        choices: [
            {
                index: 0,
                text,
                finish_reason: 'stop',
            },
        ],
        usage: mapUsageToOpenAIChat(usage),
    };
}

export function buildOpenAIEmbeddingResponse({ embeddings, model, usage }) {
    return {
        object: 'list',
        data: embeddings.map((embedding, index) => ({
            object: 'embedding',
            index,
            embedding,
        })),
        model,
        usage: {
            prompt_tokens: usage?.input ?? 0,
            total_tokens: usage?.input ?? 0,
        },
    };
}

export function buildOpenAIResponsesResponse({ response, model }) {
    const id = generateId('resp');
    const created = nowSeconds();
    const usage = mapUsageToOpenAIResponses(response.usage);
    const output = [];

    const message = {
        type: 'message',
        role: 'assistant',
        content: [{ type: 'output_text', text: response.content ?? '' }],
    };
    output.push(message);

    if (response.tool_calls?.length) {
        for (const call of response.tool_calls) {
            output.push({
                type: 'tool_call',
                id: call.id,
                name: call.name,
                arguments: JSON.stringify(call.arguments ?? {}),
            });
        }
    }

    return {
        id,
        object: 'response',
        created,
        model,
        status: 'completed',
        output,
        usage,
    };
}

export function buildOpenAIResponsesEvents({ response, model }) {
    const base = buildOpenAIResponsesResponse({ response, model });
    const events = [];

    if (response.content) {
        events.push({
            data: {
                type: 'response.output_text.delta',
                delta: response.content,
            },
        });
    }

    events.push({
        data: {
            type: 'response.completed',
            ...base,
        },
    });

    return events;
}

export function buildAnthropicMessageResponse({ response, model }) {
    const id = generateId('msg');
    const content = [];

    if (response.content) {
        content.push({ type: 'text', text: response.content });
    }

    if (response.reasoning) {
        content.push({ type: 'thinking', thinking: response.reasoning });
    }

    if (response.tool_calls?.length) {
        for (const call of response.tool_calls) {
            content.push({
                type: 'tool_use',
                id: call.id,
                name: call.name,
                input: call.arguments ?? {},
            });
        }
    }

    return {
        id,
        type: 'message',
        role: 'assistant',
        model,
        content,
        stop_reason: 'end_turn',
        usage: mapUsageToAnthropic(response.usage),
    };
}

export function buildAnthropicStreamEvents({ response, model }) {
    const id = generateId('msg');
    const usage = mapUsageToAnthropic(response.usage);
    const events = [];

    events.push({
        event: 'message_start',
        data: {
            type: 'message_start',
            message: {
                id,
                type: 'message',
                role: 'assistant',
                model,
                content: [],
                usage: { input_tokens: usage.input_tokens },
            },
        },
    });

    events.push({
        event: 'content_block_start',
        data: {
            type: 'content_block_start',
            index: 0,
            content_block: { type: 'text', text: '' },
        },
    });

    events.push({
        event: 'content_block_delta',
        data: {
            type: 'content_block_delta',
            index: 0,
            delta: { type: 'text_delta', text: response.content ?? '' },
        },
    });

    events.push({
        event: 'content_block_stop',
        data: {
            type: 'content_block_stop',
            index: 0,
        },
    });

    events.push({
        event: 'message_delta',
        data: {
            type: 'message_delta',
            delta: { stop_reason: 'end_turn' },
            usage,
        },
    });

    events.push({
        event: 'message_stop',
        data: { type: 'message_stop' },
    });

    return events;
}

export function buildGeminiGenerateResponse({ response, model }) {
    const parts = [];
    if (response.content) {
        parts.push({ text: response.content });
    }
    if (response.tool_calls?.length) {
        for (const call of response.tool_calls) {
            parts.push({
                functionCall: {
                    name: call.name,
                    args: call.arguments ?? {},
                },
            });
        }
    }

    return {
        candidates: [
            {
                content: {
                    role: 'model',
                    parts,
                },
                finishReason: 'STOP',
            },
        ],
        usageMetadata: mapUsageToGemini(response.usage),
    };
}

export function buildGeminiStreamChunks({ response, model }) {
    const chunk = buildGeminiGenerateResponse({ response, model });
    return [chunk];
}

export function mapUsageToOpenAIChat(usage = {}) {
    const prompt_tokens = usage.input ?? 0;
    const completion_tokens = usage.output ?? 0;
    const total_tokens = prompt_tokens + completion_tokens;
    const mapped = { prompt_tokens, completion_tokens, total_tokens };

    if (usage.cache_read !== undefined) {
        mapped.prompt_tokens_details = {
            cached_tokens: usage.cache_read,
        };
    }
    if (usage.reasoning !== undefined) {
        mapped.completion_tokens_details = {
            reasoning_tokens: usage.reasoning,
        };
    }
    return mapped;
}

export function mapUsageToOpenAIResponses(usage = {}) {
    const input_tokens = usage.input ?? 0;
    const output_tokens = usage.output ?? 0;
    const total_tokens = input_tokens + output_tokens;
    const mapped = { input_tokens, output_tokens, total_tokens };

    if (usage.cache_read !== undefined) {
        mapped.input_tokens_details = { cached_tokens: usage.cache_read };
    }
    if (usage.reasoning !== undefined) {
        mapped.output_tokens_details = { reasoning_tokens: usage.reasoning };
    }
    return mapped;
}

export function mapUsageToAnthropic(usage = {}) {
    const mapped = {
        input_tokens: usage.input ?? 0,
        output_tokens: usage.output ?? 0,
    };
    if (usage.cache_read !== undefined) {
        mapped.cache_read_input_tokens = usage.cache_read;
    }
    if (usage.cache_creation !== undefined) {
        mapped.cache_creation_input_tokens = usage.cache_creation;
    }
    return mapped;
}

export function mapUsageToGemini(usage = {}) {
    const promptTokenCount = usage.input ?? 0;
    const candidatesTokenCount = usage.output ?? 0;
    const mapped = {
        promptTokenCount,
        candidatesTokenCount,
        totalTokenCount: promptTokenCount + candidatesTokenCount,
    };
    if (usage.cache_read !== undefined) {
        mapped.cachedContentTokenCount = usage.cache_read;
    }
    return mapped;
}

function toOpenAIToolCalls(toolCalls) {
    return toolCalls.map((call) => ({
        id: call.id || generateId('call'),
        type: 'function',
        function: {
            name: call.name,
            arguments: JSON.stringify(call.arguments ?? {}),
        },
    }));
}
