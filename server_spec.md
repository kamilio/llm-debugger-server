# Dummy AI API Server Specification

This document defines a dummy server that supports multiple AI API "shapes"
from OpenAI, Anthropic, and Gemini. The server does not call any external
model. It returns deterministic or scripted responses for testing clients,
SDKs, and tooling.

The goal is to cover request/response shapes, authentication styles, streaming
semantics, and error formats well enough for integration tests and local
development. The server is intentionally permissive: it accepts extra fields
and ignores unsupported ones unless strict validation is enabled.

----------------------------------------------------------------------

## 1. Goals and non-goals

### Goals
1. Support OpenAI, Anthropic, and Gemini request/response shapes.
2. Provide a single server with predictable dummy behavior.
3. Support streaming and non-streaming variants.
4. Allow scripted outputs for repeatable tests.
5. Provide a minimal, stable surface for client libraries to target.

### Non-goals
1. No real model inference or safety filtering.
2. Not a full OpenAI/Anthropic/Gemini feature set. Only the core shapes.
3. No long-term storage beyond optional in-memory or local file system stubs.
4. No production-grade auth or rate limiting (only simulated behavior).

----------------------------------------------------------------------

## 2. Conventions

### Base URL
Default base URL is configurable; examples assume `http://localhost:PORT`.

### Content types
- JSON requests: `Content-Type: application/json`
- Multipart: `Content-Type: multipart/form-data` (file uploads)
- Streaming responses: `Content-Type: text/event-stream` by default

### Authentication
The server accepts these headers but does not verify by default:
- `Authorization: Bearer <token>`
- `x-api-key: <token>`
- `x-goog-api-key: <token>`

If strict auth is enabled, any request without one of these headers returns 401.

### Ids and timestamps
- `id` values are opaque strings, prefix indicates shape.
- `created` is a Unix timestamp (seconds).
- `x-request-id` is included in response headers.

### Token accounting
Tokens are estimated with a simple heuristic unless configured otherwise:
- Default: number of whitespace-separated tokens in input text.
- For multi-part inputs, counts all text parts; ignores images/binary.
- `usage` fields are included in all responses that support them.

### Determinism
Responses are deterministic by default:
- If a request includes `seed`, it is used for deterministic randomness.
- Otherwise deterministic defaults are applied (no randomness).

### Validation
By default, the server is permissive:
- Unknown fields are ignored.
- Missing optional fields are defaulted.
When strict validation is enabled, the server rejects unknown fields.

----------------------------------------------------------------------

## 3. Supported API surfaces

### 3.1 OpenAI-compatible (default prefix `/v1`)
Endpoints (all support JSON requests, streaming where applicable):
- `GET  /v1/models`
- `GET  /v1/models/{model}`
- `POST /v1/chat/completions`
- `POST /v1/completions`
- `POST /v1/embeddings`
- `POST /v1/responses`
- `POST /v1/audio/transcriptions`
- `POST /v1/audio/translations`
- `POST /v1/images/generations`
- `POST /v1/images/edits`
- `POST /v1/images/variations`
- `POST /v1/moderations`
- `POST /v1/files` (upload)
- `GET  /v1/files` (list)
- `GET  /v1/files/{file_id}` (retrieve metadata)
- `DELETE /v1/files/{file_id}` (delete)

### 3.2 Anthropic-compatible (prefix `/v1`)
Endpoints:
- `POST /v1/messages`
- `POST /v1/messages/count_tokens`
- `GET  /v1/models`
- `GET  /v1/models/{model}`

Note: Anthropic and OpenAI share `/v1/models` but return different shapes.
If `x-provider: anthropic` header is present, Anthropic shape is used.

### 3.3 Gemini native (prefix `/v1beta`)
Endpoints:
- `GET  /v1beta/models`
- `GET  /v1beta/models/{model}`
- `POST /v1beta/models/{model}:generateContent`
- `POST /v1beta/models/{model}:streamGenerateContent`
- `POST /v1beta/models/{model}:countTokens`

### 3.4 Gemini OpenAI-compat (optional alias)
If enabled, the server exposes OpenAI-compatible endpoints at:
- `/v1beta/openai/*` mapped to `/v1/*`

----------------------------------------------------------------------

## 4. Models and behaviors

### 4.1 Built-in models
The server ships with these named models. Behavior is determined by model
name or by a configured behavior profile.

- `Echo`
  - Returns the last user message or prompt text verbatim.
- `Robot`
  - Returns scripted responses defined in a config file.
- `Weirdo`
  - Returns odd but deterministic responses to test parsing.
- `Thinker`
  - Returns a short "thinking summary" field in addition to text output.
  - The server never returns internal chain-of-thought, only a summary.

### 4.2 Behavior selection
The server determines the behavior for a request in this order:
1. If request includes `x-behavior` header, use it.
2. Else if model name is mapped to a behavior, use that.
3. Else use the default behavior (Echo).

### 4.3 Scripted Robot behavior
Robot behavior uses a script file (YAML or JSON):

Example (YAML):
```
rules:
  - match: "hello"
    response: "Hello there."
  - match: "/\\bstatus\\b/i"
    response: "All systems nominal."
fallback: "No matching rule."
```

Rules are matched against the last user input. The first match wins.

----------------------------------------------------------------------

## 5. Cross-shape normalization rules

To keep behavior consistent across provider shapes:
- The last user input is extracted from each request shape.
- Text-only responses are generated from the same behavior output.
- If tools or function calls are requested, the server emits dummy tool calls.
- Image/audio inputs are accepted but not processed; they only affect metadata.

Mapping rules:
- OpenAI: last `messages` entry with `role: "user"` and text content.
- Anthropic: last `messages` entry with `role: "user"` and text blocks.
- Gemini: last `contents` entry with `role: "user"` and text parts.

----------------------------------------------------------------------

## 6. OpenAI-compatible endpoints

### 6.1 GET /v1/models
Response:
```
{
  "object": "list",
  "data": [
    { "id": "Echo", "object": "model", "owned_by": "dummy" },
    { "id": "Robot", "object": "model", "owned_by": "dummy" }
  ]
}
```
Usage: not returned for this endpoint.

### 6.2 GET /v1/models/{model}
Response:
```
{ "id": "Echo", "object": "model", "owned_by": "dummy" }
```
Usage: not returned for this endpoint.

### 6.3 POST /v1/chat/completions
Request (subset):
```
{
  "model": "Echo",
  "messages": [
    { "role": "system", "content": "You are helpful." },
    { "role": "user", "content": "Hello" }
  ],
  "temperature": 0.2,
  "max_tokens": 64,
  "stream": false,
  "seed": 123
}
```

Response (non-stream):
```
{
  "id": "chatcmpl_123",
  "object": "chat.completion",
  "created": 1700000000,
  "model": "Echo",
  "choices": [
    {
      "index": 0,
      "message": { "role": "assistant", "content": "Hello" },
      "finish_reason": "stop"
    }
  ],
  "usage": { "prompt_tokens": 2, "completion_tokens": 1, "total_tokens": 3 }
}
```

Usage:
- `usage` uses the CompletionUsage shape: `prompt_tokens`, `completion_tokens`, `total_tokens`.
- Optional `prompt_tokens_details` may include `cached_tokens` and `audio_tokens`.
- Optional `completion_tokens_details` may include `reasoning_tokens`, `audio_tokens`,
  `accepted_prediction_tokens`, and `rejected_prediction_tokens`.
- Streaming: if `stream_options.include_usage=true`, emit a final chunk with empty `choices` and full
  `usage`. All earlier chunks include `"usage": null`.

Streaming response:
- Content-Type: `text/event-stream`
- Data events are OpenAI `chat.completion.chunk` objects.
- The final event is `data: [DONE]`.

### 6.4 POST /v1/completions
Request:
```
{
  "model": "Echo",
  "prompt": "Hello",
  "max_tokens": 16,
  "temperature": 0.0
}
```
Response:
```
{
  "id": "cmpl_123",
  "object": "text_completion",
  "created": 1700000000,
  "model": "Echo",
  "choices": [
    { "index": 0, "text": "Hello", "finish_reason": "stop" }
  ],
  "usage": { "prompt_tokens": 1, "completion_tokens": 1, "total_tokens": 2 }
}
```

Usage:
- `usage` uses the CompletionUsage shape: `prompt_tokens`, `completion_tokens`, `total_tokens`.
- Optional `prompt_tokens_details` may include `cached_tokens` and `audio_tokens`.
- Optional `completion_tokens_details` may include `reasoning_tokens`, `audio_tokens`,
  `accepted_prediction_tokens`, and `rejected_prediction_tokens`.

### 6.5 POST /v1/embeddings
Request:
```
{ "model": "Echo", "input": "hello" }
```
Response (vector length is configurable, default 8):
```
{
  "object": "list",
  "data": [{ "object": "embedding", "index": 0, "embedding": [0.1, 0.2] }],
  "model": "Echo",
  "usage": { "prompt_tokens": 1, "total_tokens": 1 }
}
```

Usage:
- `usage` includes `prompt_tokens` and `total_tokens` only (no completion tokens).

### 6.6 POST /v1/responses
Request (subset):
```
{
  "model": "Echo",
  "input": "Hello",
  "stream": false
}
```
Response:
```
{
  "id": "resp_123",
  "object": "response",
  "created": 1700000000,
  "model": "Echo",
  "status": "completed",
  "output": [
    {
      "type": "message",
      "role": "assistant",
      "content": [{ "type": "output_text", "text": "Hello" }]
    }
  ],
  "usage": { "input_tokens": 1, "output_tokens": 1, "total_tokens": 2 }
}
```

Usage:
- `usage` uses the ResponseUsage shape: `input_tokens`, `output_tokens`, `total_tokens`.
- `input_tokens_details` includes `cached_tokens`.
- `output_tokens_details` includes `reasoning_tokens`.
- Streaming: the final `response.completed` event includes full `usage`.

Streaming:
- `text/event-stream`
- Events are `response.output_text.delta` and `response.completed`.

### 6.7 POST /v1/audio/transcriptions
Request (multipart):
Fields: `file`, `model`, `language`, `prompt`, `response_format`
Response:
- If `response_format` is `json` or missing:
  `{ "text": "transcribed text" }`
- If `response_format` is `verbose_json`, include `language` and `segments`.

Usage:
- For token-billed models, `usage.type` is `tokens` and includes:
  `input_tokens`, `input_token_details` (`text_tokens`, `audio_tokens`),
  `output_tokens`, `total_tokens`.
- For duration-billed models, `usage.type` is `duration` and includes `seconds`.
- Streaming: the final `transcript.text.done` event can include the token-usage variant.

### 6.8 POST /v1/audio/translations
Same as transcriptions, but language is "en" by default.
Usage: not returned in the base translation response shape.

### 6.9 POST /v1/images/generations
Request:
```
{ "model": "Echo", "prompt": "a cat", "n": 1, "size": "1024x1024" }
```
Response (default URL format):
```
{ "created": 1700000000, "data": [{ "url": "https://dummy.local/image/1" }] }
```
If `response_format` is `b64_json`, return base64 placeholders.

Usage:
- For GPT image models, include `usage` with `total_tokens`, `input_tokens`, `output_tokens`.
- `input_tokens_details` includes `text_tokens` and `image_tokens`.
- For `gpt-image-1`, `output_tokens_details` may be present.
- For non-GPT image models, omit `usage`.

### 6.10 POST /v1/images/edits
Multipart fields: `image`, `mask` (optional), `prompt`, `n`, `size`
Response uses the same shape as generations.
Usage: same rules as `/v1/images/generations`.

### 6.11 POST /v1/images/variations
Multipart fields: `image`, `n`, `size`
Response uses the same shape as generations.
Usage: same rules as `/v1/images/generations`.

### 6.12 POST /v1/moderations
Request:
```
{ "input": "some text", "model": "omni-moderation-latest" }
```
Response (always safe unless configured):
```
{
  "id": "modr_123",
  "model": "omni-moderation-latest",
  "results": [
    {
      "flagged": false,
      "categories": { "hate": false, "violence": false },
      "category_scores": { "hate": 0.0, "violence": 0.0 }
    }
  ]
}
```
Usage: not returned for this endpoint.

### 6.13 /v1/files (upload/list/retrieve/delete)
Upload (multipart):
- Fields: `file`, `purpose`
Response:
```
{
  "id": "file_123",
  "object": "file",
  "bytes": 1234,
  "created_at": 1700000000,
  "filename": "data.jsonl",
  "purpose": "fine-tune"
}
```
List:
```
{ "object": "list", "data": [ ... ] }
```
Delete:
```
{ "id": "file_123", "object": "file", "deleted": true }
```
Usage: not returned for these endpoints.

----------------------------------------------------------------------

## 7. Anthropic-compatible endpoints

### 7.1 POST /v1/messages
Request (subset):
```
{
  "model": "claude-3-sonnet-20240229",
  "max_tokens": 128,
  "messages": [
    { "role": "user", "content": [{ "type": "text", "text": "Hello" }] }
  ],
  "stream": false
}
```

Response:
```
{
  "id": "msg_123",
  "type": "message",
  "role": "assistant",
  "model": "claude-3-sonnet-20240229",
  "content": [{ "type": "text", "text": "Hello" }],
  "stop_reason": "end_turn",
  "usage": { "input_tokens": 1, "output_tokens": 1 }
}
```

Usage:
- `usage` includes `input_tokens` and `output_tokens`.
- Optional caching fields: `cache_creation_input_tokens`, `cache_read_input_tokens`.
- Optional `cache_creation` object can include `ephemeral_1h_input_tokens` and `ephemeral_5m_input_tokens`.
- Optional `server_tool_use` and `service_tier` may appear.
- Streaming: include the same `usage` summary on the final event or in the final message object.

Streaming:
- `text/event-stream`
- Event types: `message_start`, `content_block_start`,
  `content_block_delta`, `content_block_stop`, `message_delta`, `message_stop`.
- The server can emit a minimal subset (start, delta, stop).

### 7.2 POST /v1/messages/count_tokens
Request:
```
{
  "model": "claude-3-sonnet-20240229",
  "messages": [
    { "role": "user", "content": [{ "type": "text", "text": "Hello" }] }
  ]
}
```
Response:
```
{ "input_tokens": 1 }
```
Usage: this endpoint returns only `input_tokens`.

### 7.3 GET /v1/models (Anthropic shape)
Response:
```
{
  "data": [
    { "id": "claude-3-sonnet-20240229", "display_name": "Claude 3 Sonnet" }
  ]
}
```
Usage: not returned for this endpoint.

### 7.4 GET /v1/models/{model} (Anthropic shape)
Response:
```
{ "id": "claude-3-sonnet-20240229", "display_name": "Claude 3 Sonnet" }
```
Usage: not returned for this endpoint.

----------------------------------------------------------------------

## 8. Gemini native endpoints

### 8.1 GET /v1beta/models
Response:
```
{
  "models": [
    { "name": "models/gemini-1.5-pro", "displayName": "Gemini 1.5 Pro" }
  ]
}
```
Usage: not returned for this endpoint.

### 8.2 GET /v1beta/models/{model}
Response:
```
{ "name": "models/gemini-1.5-pro", "displayName": "Gemini 1.5 Pro" }
```
Usage: not returned for this endpoint.

### 8.3 POST /v1beta/models/{model}:generateContent
Request (subset):
```
{
  "contents": [
    { "role": "user", "parts": [{ "text": "Hello" }] }
  ],
  "generationConfig": { "maxOutputTokens": 64, "temperature": 0.2 }
}
```
Response:
```
{
  "candidates": [
    {
      "content": {
        "role": "model",
        "parts": [{ "text": "Hello" }]
      },
      "finishReason": "STOP"
    }
  ],
  "usageMetadata": { "promptTokenCount": 1, "candidatesTokenCount": 1 }
}
```

Usage:
- `usageMetadata` is output-only and may include:
  `promptTokenCount`, `cachedContentTokenCount`, `candidatesTokenCount`,
  `toolUsePromptTokenCount`, `totalTokenCount`.
- Optional modality arrays: `promptTokensDetails`, `cacheTokensDetails`,
  `candidatesTokensDetails`, `toolUsePromptTokensDetails`.

### 8.4 POST /v1beta/models/{model}:streamGenerateContent
Streaming response formats:
- Default: `text/event-stream` with one JSON object per event.
- Optional: `application/x-ndjson` if `stream_format=ndjson`.

Each chunk is a `GenerateContentResponse` object.
Usage: include `usageMetadata` on the final chunk if available.

### 8.5 POST /v1beta/models/{model}:countTokens
Request:
```
{ "contents": [{ "role": "user", "parts": [{ "text": "Hello" }] }] }
```
Response:
```
{ "totalTokens": 1 }
```
Usage:
- Response fields include `totalTokens` and may include `cachedContentTokenCount`.
- Optional modality arrays: `promptTokensDetails`, `cacheTokensDetails`.

----------------------------------------------------------------------

## 9. Error handling

### 9.1 OpenAI-style error
```
{
  "error": {
    "message": "Bad request",
    "type": "invalid_request_error",
    "param": "model",
    "code": "invalid_model"
  }
}
```

### 9.2 Anthropic-style error
```
{ "type": "error", "error": { "type": "invalid_request_error", "message": "Bad request" } }
```

### 9.3 Gemini-style error
```
{
  "error": {
    "code": 400,
    "message": "Bad request",
    "status": "INVALID_ARGUMENT"
  }
}
```

Errors can be triggered via:
- `x-error: <code>` header
- `simulate_error` field in request body

----------------------------------------------------------------------

## 10. Streaming details

### 10.1 OpenAI chat/completions
Each SSE event is:
```
data: { "id": "...", "object": "chat.completion.chunk", "choices": [ ... ] }
```
Final event:
```
data: [DONE]
```

### 10.2 OpenAI responses
Each SSE event is:
```
data: { "type": "response.output_text.delta", "delta": "..." }
```
Final event:
```
data: { "type": "response.completed", ... }
```

### 10.3 Anthropic messages
Events use the `event:` field and `data:` JSON payloads.
Example sequence:
```
event: message_start
data: { "type": "message_start", "message": { ... } }

event: content_block_delta
data: { "type": "content_block_delta", "delta": { "text": "He" } }
```

### 10.4 Gemini stream
SSE by default. Each chunk is a `GenerateContentResponse` object.

----------------------------------------------------------------------

## 11. Tool and function call simulation

The server can simulate tool use for each shape:
- OpenAI: `tools` + `tool_choice` may yield `tool_calls`.
- Anthropic: `tools` may yield `tool_use` content blocks.
- Gemini: function calling expressed as tool parts (optional).

Behavior rules:
- If `tool_choice` or `tool_name` matches, return one tool call.
- Tool arguments are generated from the user input using simple heuristics.
- A special header `x-tool-result` can force a tool call with fixed args.

----------------------------------------------------------------------

## 12. Configuration

Configuration can be provided via a file or environment variables.

### 12.1 Config file (YAML or JSON)
Suggested keys:
```
port: 8080
strict_validation: false
require_auth: false
default_behavior: Echo
embedding_size: 8
latency_ms: 0
error_rate: 0.0
models:
  Echo:
    behavior: Echo
  Robot:
    behavior: Robot
    script: ./scripts/robot.yaml
```

### 12.2 Environment variables
- `PORT`
- `STRICT_VALIDATION`
- `REQUIRE_AUTH`
- `DEFAULT_BEHAVIOR`
- `EMBEDDING_SIZE`
- `LATENCY_MS`
- `ERROR_RATE`

----------------------------------------------------------------------

## 13. Observability and debug hooks

### 13.1 Logging
Each request should log:
- method, path, status, response time
- extracted input summary
- chosen behavior

### 13.2 Debug headers
The server supports optional debug headers:
- `x-behavior: Echo|Robot|Weirdo|Thinker`
- `x-delay-ms: <int>`
- `x-error: <code>`
- `x-request-id: <id>` (echoed back)

----------------------------------------------------------------------

## 14. Compatibility notes

- Anthropic and OpenAI both use `/v1/*` paths. Use `x-provider` to disambiguate:
  - `x-provider: anthropic` uses Anthropic shapes
  - `x-provider: openai` uses OpenAI shapes
- Gemini OpenAI-compat is optional and served under `/v1beta/openai/*`.
- The server always accepts unknown fields unless strict validation is enabled.

----------------------------------------------------------------------

## 15. SDK-based test plan (base_url)

This section outlines how to test each endpoint using official SDKs configured
with a custom base URL. The examples use Python for clarity; adjust to your
preferred language as needed.

### 15.1 OpenAI SDK (Python)
Client setup:
```
from openai import OpenAI

client = OpenAI(
    api_key="test",
    base_url="http://localhost:8080/v1",
)
```

Assertions by endpoint:
- `/v1/models`: `client.models.list()`; assert `object == "list"`, `data` is a list,
  each item has `id` and `object == "model"`.
- `/v1/models/{model}`: `client.models.retrieve("Echo")`; assert `id == "Echo"`.
- `/v1/chat/completions`: `client.chat.completions.create(...)`; assert
  `choices[0].message.role == "assistant"`, `choices[0].message.content` matches
  the Echo/Robot behavior, `usage.prompt_tokens`, `usage.completion_tokens`,
  `usage.total_tokens` present.
- `/v1/chat/completions` (stream): call with `stream=True` and
  `stream_options={"include_usage": True}`; assert chunks are
  `chat.completion.chunk`, final chunk has empty `choices` and populated `usage`,
  then `[DONE]`.
- `/v1/completions`: `client.completions.create(...)`; assert `choices[0].text`
  and `usage` fields match CompletionUsage.
- `/v1/embeddings`: `client.embeddings.create(...)`; assert
  `len(data[0].embedding) == embedding_size` and `usage.prompt_tokens` present.
- `/v1/responses`: `client.responses.create(...)`; assert `object == "response"`,
  `output[0].type == "message"`, `output[0].content[0].type == "output_text"`,
  and `usage.input_tokens`, `usage.output_tokens`, `usage.total_tokens` present.
- `/v1/responses` (stream): `client.responses.stream(...)` or
  `client.responses.create(stream=True, ...)`; assert
  `response.output_text.delta` events appear and final `response.completed`
  includes full `usage`.
- `/v1/audio/transcriptions`: `client.audio.transcriptions.create(...)` with a
  local audio file; assert `text` is non-empty. If `response_format="json"`,
  assert `usage.type` is `tokens` or `duration`. For streaming, assert the final
  `transcript.text.done` event includes token-usage fields.
- `/v1/audio/translations`: `client.audio.translations.create(...)`; assert
  `text` is non-empty; usage is absent.
- `/v1/images/generations`: `client.images.generate(...)`; assert `data` length
  and each item includes `url` or `b64_json`. If using a GPT image model, assert
  `usage.total_tokens`, `usage.input_tokens`, `usage.output_tokens` present.
- `/v1/images/edits`: `client.images.edit(...)`; same assertions as generations.
- `/v1/images/variations`: `client.images.create_variation(...)`; same assertions.
- `/v1/moderations`: `client.moderations.create(...)`; assert
  `results[0].flagged` is a boolean; usage absent.
- `/v1/files`: `client.files.create(...)` to upload a small temp file; assert
  `object == "file"`, `bytes` > 0, `purpose` echoed. Then `client.files.list()`,
  `client.files.retrieve(id)`, and `client.files.delete(id)`; assert `deleted`
  is `true`.

### 15.2 Anthropic SDK (Python)
Client setup:
```
from anthropic import Anthropic

client = Anthropic(
    api_key="test",
    base_url="http://localhost:8080",
    default_headers={"x-provider": "anthropic"},
)
```

Assertions by endpoint:
- `/v1/messages`: `client.messages.create(...)`; assert `type == "message"`,
  `content[0].type == "text"`, `content[0].text` matches behavior, and
  `usage.input_tokens`, `usage.output_tokens` present. If enabled, assert
  caching fields (e.g., `cache_read_input_tokens`) appear with integer values.
- `/v1/messages` (stream): `client.messages.create(stream=True, ...)`; assert
  event sequence includes `message_start`, `content_block_delta`, `message_stop`,
  and a final usage summary on the stop event or final message object.
- `/v1/messages/count_tokens`: `client.messages.count_tokens(...)`; assert
  `input_tokens` is an integer and matches the configured tokenizer heuristic.
- `/v1/models`: `client.models.list()`; assert `data` list and `id` + `display_name`.
- `/v1/models/{model}`: `client.models.retrieve("claude-3-sonnet-20240229")`;
  assert `id` and `display_name`.

### 15.3 Gemini SDK (Python, google-genai)
Client setup:
```
from google import genai
from google.genai import types

client = genai.Client(
    api_key="test",
    http_options={"base_url": "http://localhost:8080"},
)
```

Assertions by endpoint:
- `/v1beta/models`: `client.models.list()`; assert `models` list and each entry
  has `name` and `displayName`.
- `/v1beta/models/{model}`: `client.models.get("gemini-1.5-pro")`; assert `name`
  and `displayName`.
- `/v1beta/models/{model}:generateContent`: `client.models.generate_content(...)`;
  assert `candidates[0].content.parts[0].text` and `usageMetadata.promptTokenCount`
  + `usageMetadata.candidatesTokenCount` present; if enabled, assert
  `totalTokenCount` and modality arrays.
- `/v1beta/models/{model}:streamGenerateContent`:
  `client.models.generate_content_stream(...)`; assert chunk text deltas and
  final chunk includes `usageMetadata` if configured.
- `/v1beta/models/{model}:countTokens`: `client.models.count_tokens(...)`; assert
  `totalTokens` and optional `cachedContentTokenCount` fields.

### 15.4 Gemini via OpenAI-compat (optional)
If the `/v1beta/openai/*` alias is enabled, you can test Gemini models with the
OpenAI SDK by setting:
```
from openai import OpenAI
client = OpenAI(api_key="test", base_url="http://localhost:8080/v1beta/openai")
```
Then run the same OpenAI tests (chat/completions, responses, embeddings) while
using Gemini model IDs (e.g., `gemini-1.5-pro`).

----------------------------------------------------------------------

## 16. Examples

### OpenAI chat completion
```
curl http://localhost:8080/v1/chat/completions \\
  -H 'Content-Type: application/json' \\
  -d '{ "model": "Echo", "messages": [{ "role": "user", "content": "Hi" }] }'
```

### Anthropic message
```
curl http://localhost:8080/v1/messages \\
  -H 'Content-Type: application/json' \\
  -H 'x-provider: anthropic' \\
  -d '{ "model": "claude-3-sonnet-20240229", "max_tokens": 64, "messages": [{ "role": "user", "content": [{ "type": "text", "text": "Hi" }] }] }'
```

### Gemini generateContent
```
curl http://localhost:8080/v1beta/models/gemini-1.5-pro:generateContent \\
  -H 'Content-Type: application/json' \\
  -d '{ "contents": [{ "role": "user", "parts": [{ "text": "Hi" }] }] }'
```

----------------------------------------------------------------------

## 17. Future extensions (optional)

- Realtime endpoints
- Batches
- Tool result validation
- Persistent file storage
- Metrics endpoint (`/metrics`)
