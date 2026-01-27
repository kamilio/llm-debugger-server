import test from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer } from './helpers.js';

test('OpenAI chat completions echo last user message', async () => {
    const models = {
        echo: [
            { _default: { type: 'echo' } },
        ],
    };

    const { server, port } = await startTestServer(models);
    const response = await fetch(`http://127.0.0.1:${port}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model: 'echo',
            messages: [{ role: 'user', content: 'hello' }],
        }),
    });

    const payload = await response.json();
    await new Promise((resolve) => server.close(resolve));

    assert.equal(payload.choices[0].message.content, 'hello');
});
