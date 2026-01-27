import test from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer } from './helpers.js';

test('Anthropic messages echo last user message', async () => {
    const models = {
        echo: [
            { _default: { type: 'echo' } },
        ],
    };

    const { server, port } = await startTestServer(models);
    const response = await fetch(`http://127.0.0.1:${port}/v1/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model: 'echo',
            max_tokens: 16,
            messages: [{ role: 'user', content: [{ type: 'text', text: 'hello' }] }],
        }),
    });

    const payload = await response.json();
    await new Promise((resolve) => server.close(resolve));

    assert.equal(payload.content[0].text, 'hello');
});
