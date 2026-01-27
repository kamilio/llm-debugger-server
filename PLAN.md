# Instructions

- Setup a new node project, good practices
- Setup git and make atomic commits

This project is a dummy server that simulates AI APIs e.g. chat/completions for testing purposes

## Server Configuration

- **Port**: Configurable via `PORT` env var (default: 3000)
- **CORS**: Allow all origins
- **API Key Validation**: None (accept any or no key)
- **Health Check**: `GET /health` returns `{ "status": "ok" }`

## Spec

### Endpoints

All endpoints follow first-party provider specs exactly, allowing testing with official client libraries (`openai`, `@anthropic-ai/sdk`, `@google/generative-ai`).

The **endpoint path determines the response format** - the server uses a translation layer to automatically convert internal responses to the correct provider-specific format.

| Endpoint | Provider | Streaming |
|----------|----------|-----------|
| `POST /v1/chat/completions` | OpenAI | Both |
| `POST /v1/responses` | OpenAI | Both |
| `POST /v1/messages` | Anthropic | Both |
| `POST /v1beta/models/{model}:generateContent` | Gemini | Non-streaming |
| `POST /v1beta/models/{model}:streamGenerateContent` | Gemini | Streaming |

### Token Counting

For simplicity, token counts are calculated using **character count** (not actual tokenization).

### Config

config.yaml - structured as `models: { model_name: [triggers] }`.

**Resolution order:**

1. Look up model name from request
2. Iterate through that model's trigger list, find exact match on last user message
3. Use `_default` entry if no message matches
4. If model not in config → 404 error

```yaml
models:
  # Echo model - returns last user message
  echo:
    - _default:
        type: "echo"

  # Weirdo model - gibberish with huge token counts
  weirdo:
    - _default:
        type: "message"
        content: "asdkjhasd kajshd aksjdh..."
        usage:
          output: 999999

  # Thinker model - reasoning + response
  thinker:
    - _default:
        type: "message"
        reasoning: "hmm let me think about this... *gibberish*"
        content: "here is my thoughtful response... *gibberish*"

  # Coder model - tool calls with reasoning
  coder:
    - _default:
        type: "message"
        reasoning: "I need to read this file first..."
        tool_calls:
          - name: "read_file"
            arguments: { "path": "/src/main.js" }

  # GPT-4 with specific message triggers
  gpt-4:
    - "hello": "Hi there!"
    - "test error":
        type: "error"
        status: 500
        message: "Internal server error"
    - "rate limit":
        type: "error"
        status: 429
        message: "Rate limit exceeded"
    - "load fixture":
        type: "file"
        path: fixtures/recorded-response.yaml
    - _default:
        type: "echo"

  # Claude model with custom responses
  claude-3-opus:
    - "think hard":
        type: "message"
        reasoning: "Deep thinking happening here..."
        content: "After careful consideration..."
        usage:
          input: 500
          output: 1000
          reasoning: 2000
    - _default:
        type: "message"
        content: "I'm Claude, how can I help?"
```

### Response Types

| Type | Description |
|------|-------------|
| `"string"` | Shorthand for `{ type: "message", content: "string" }` |
| `type: "echo"` | Returns the last user message as-is |
| `type: "message"` | Custom response with optional `content`, `reasoning`, `tool_calls`, `usage` |
| `type: "file"` | Load prerecorded response from file (YAML or JSON) |
| `type: "error"` | Return error response with `status` and `message` |

### Model Inheritance

Models can inherit from other models using `_inherit`. The child model's triggers are checked first, then falls back to the parent's triggers.

```yaml
models:
  # Base model
  base-claude:
    - "hello": "Hi from Claude!"
    - _default:
        type: "message"
        content: "I'm Claude"

  # Inherits from base-claude, adds/overrides triggers
  claude-3-opus:
    - _inherit: base-claude
    - "hello": "Hi from Opus specifically!"  # overrides parent's "hello"
    - "think":
        type: "message"
        reasoning: "Deep thoughts..."
        content: "Here's my analysis"
    # Falls back to base-claude's _default if no match
```

Resolution with inheritance:

1. Check child model's triggers (excluding `_inherit`)
2. If no match, check parent model's triggers
3. Continue up the inheritance chain
4. Use first `_default` found in chain

### GET /v1/models

Returns list of all model names defined in config (excludes models starting with `_` or used only as base models if desired).

### Prerecorded File Format

Files loaded via `type: "file"` use the full request/response log format. Supports both YAML and JSON.

```yaml
# fixtures/example.yaml
timestamp: '2026-01-14T17:43:13.913Z'
duration_ms: 4560
request:
  method: POST
  url: https://api.openai.com/v1/chat/completions
  headers:
    content-type: application/json
    authorization: Bearer...xxx
  body:
    model: gpt-4
    messages:
      - role: user
        content: "Hello"
    stream: true
response:
  status: 200
  headers:
    content-type: text/event-stream
  body:
    # For streaming: array of SSE chunks
    - id: chatcmpl-xxx
      object: chat.completion.chunk
      created: 1768412589
      model: gpt-4
      choices:
        - index: 0
          delta:
            role: assistant
          finish_reason: null
    - id: chatcmpl-xxx
      object: chat.completion.chunk
      created: 1768412589
      model: gpt-4
      choices:
        - index: 0
          delta:
            content: "Hello!"
          finish_reason: null
    - id: chatcmpl-xxx
      object: chat.completion.chunk
      choices:
        - delta: {}
          finish_reason: stop
      usage:
        prompt_tokens: 10
        completion_tokens: 5
        total_tokens: 15
    - done: true
  is_streaming: true

# For non-streaming: body is a single object
# response:
#   status: 200
#   body:
#     id: chatcmpl-xxx
#     choices: [...]
#   is_streaming: false
```

The server will:

- Detect streaming mode via `is_streaming` flag or `request.body.stream`
- Replay the response body chunks with appropriate SSE formatting
- Use `duration_ms` to optionally simulate realistic latency

### Translation Layer

Internal responses use a canonical format that gets automatically translated to provider-specific formats based on the endpoint.

#### Canonical Format

```javascript
{
  content: "Hello!",
  reasoning: "thinking...",  // optional
  tool_calls: [...],         // optional
  usage: {
    input: 100,              // input/prompt tokens
    output: 50,              // output/completion tokens
    reasoning: 25,           // optional: reasoning tokens
    cache_read: 10,          // optional: cached tokens read
    cache_creation: 5        // optional: tokens added to cache
  }
}
```

#### Usage Translation

| Canonical | OpenAI | Anthropic | Gemini |
|-----------|--------|-----------|--------|
| `input` | `usage.prompt_tokens` | `usage.input_tokens` | `usageMetadata.promptTokenCount` |
| `output` | `usage.completion_tokens` | `usage.output_tokens` | `usageMetadata.candidatesTokenCount` |
| `reasoning` | `usage.completion_tokens_details.reasoning_tokens` | (included in output) | (included in output) |
| `cache_read` | `usage.prompt_tokens_details.cached_tokens` | `usage.cache_read_input_tokens` | (not supported) |
| `cache_creation` | (not supported) | `usage.cache_creation_input_tokens` | (not supported) |

#### Content Translation

| Canonical | OpenAI | Anthropic | Gemini |
|-----------|--------|-----------|--------|
| `content` | `choices[].message.content` | `content[].text` | `candidates[].content.parts[].text` |
| `reasoning` | `choices[].message.reasoning_content` | `content[].thinking` | (not supported) |
| `tool_calls` | `choices[].message.tool_calls` | `content[].tool_use` | `candidates[].content.parts[].functionCall` |

This allows config entries like `type: "message"` to work across all endpoints.

## Daemon (inspired by existing daemon.js)

CLI commands:

- `start` - start server in background
- `stop` - graceful shutdown
- `restart` - stop + start
- `status` - check if running
- `run` - run in foreground

Features:

- PID file management
- Graceful shutdown (SIGTERM/SIGINT)
- IPC for startup coordination

## Deployment

### Fly.io

```toml
# fly.toml
app = "llm-debugger-server"
primary_region = "iad"

[build]
  dockerfile = "Dockerfile"

[env]
  PORT = "8080"
  NODE_ENV = "production"

[http_service]
  internal_port = 8080
  force_https = true
  auto_stop_machines = "stop"
  auto_start_machines = true
  min_machines_running = 0

[[vm]]
  memory = "256mb"
  cpu_kind = "shared"
  cpus = 1
```

```dockerfile
# Dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --production
COPY . .
EXPOSE 8080
CMD ["node", "src/server.js"]
```

Deploy commands:

```bash
fly launch --no-deploy
fly deploy
fly logs
```

## Testing

### Unit Tests

Test individual components in isolation:

- **Translation layer** - verify canonical → provider format conversion
- **Config matching** - exact match behavior, fallback to default
- **Models** - Echo returns input, Weirdo generates gibberish with large counts, etc.
- **Token counting** - character-based calculation

### Integration Tests

End-to-end tests using official client libraries:

- Each test suite starts its own server on a **random available port**
- Uses a test-specific `config.yaml` fixture
- Tests against real SDK clients (`openai`, `@anthropic-ai/sdk`, `@google/generative-ai`)
- Validates both streaming and non-streaming responses

```javascript
// Example integration test structure
describe('OpenAI endpoint', () => {
  let server, port;

  beforeAll(async () => {
    port = await getRandomPort();
    server = await startServer({ port, config: 'fixtures/test-config.yaml' });
  });

  afterAll(() => server.close());

  it('echoes last message with Echo model', async () => {
    const client = new OpenAI({ baseURL: `http://localhost:${port}/v1` });
    const response = await client.chat.completions.create({
      model: 'echo',
      messages: [{ role: 'user', content: 'hello' }]
    });
    expect(response.choices[0].message.content).toBe('hello');
  });
});
```

### Test Commands

```bash
npm test          # run all tests
npm run test:unit # unit tests only
npm run test:integration # integration tests only
```
