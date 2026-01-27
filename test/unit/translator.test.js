import test from 'node:test';
import assert from 'node:assert/strict';
import { mapUsageToOpenAIChat, mapUsageToAnthropic, mapUsageToGemini } from '../../src/translator.js';

test('maps canonical usage to OpenAI chat usage', () => {
    const usage = mapUsageToOpenAIChat({ input: 2, output: 3, reasoning: 1, cache_read: 4 });
    assert.equal(usage.prompt_tokens, 2);
    assert.equal(usage.completion_tokens, 3);
    assert.equal(usage.total_tokens, 5);
    assert.equal(usage.completion_tokens_details.reasoning_tokens, 1);
    assert.equal(usage.prompt_tokens_details.cached_tokens, 4);
});

test('maps canonical usage to Anthropic usage', () => {
    const usage = mapUsageToAnthropic({ input: 1, output: 2, cache_read: 3, cache_creation: 4 });
    assert.equal(usage.input_tokens, 1);
    assert.equal(usage.output_tokens, 2);
    assert.equal(usage.cache_read_input_tokens, 3);
    assert.equal(usage.cache_creation_input_tokens, 4);
});

test('maps canonical usage to Gemini usage', () => {
    const usage = mapUsageToGemini({ input: 4, output: 5, cache_read: 6 });
    assert.equal(usage.promptTokenCount, 4);
    assert.equal(usage.candidatesTokenCount, 5);
    assert.equal(usage.totalTokenCount, 9);
    assert.equal(usage.cachedContentTokenCount, 6);
});
