import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeModels, resolveTriggerResponse } from '../../src/model-config.js';

test('resolves triggers with inheritance and defaults', () => {
    const registry = normalizeModels({
        base: [
            { hello: 'hi from base' },
            { _default: 'base default' },
        ],
        child: [
            { _inherit: 'base' },
            { hello: 'hi from child' },
        ],
    });

    const direct = resolveTriggerResponse('child', 'hello', registry);
    assert.equal(direct.response, 'hi from child');

    const fallback = resolveTriggerResponse('child', 'other', registry);
    assert.equal(fallback.response, 'base default');
});
