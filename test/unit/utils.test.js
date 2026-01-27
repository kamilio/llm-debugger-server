import test from 'node:test';
import assert from 'node:assert/strict';
import { countTokens } from '../../src/utils.js';

test('counts tokens by chars', () => {
    assert.equal(countTokens('abc', 'chars'), 3);
});

test('counts tokens by words', () => {
    assert.equal(countTokens('hello world', 'words'), 2);
});
