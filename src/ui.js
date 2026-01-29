import { listModelNames } from './model-config.js';

const FONT_LINKS = `
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet" />
`;

const BUILTIN_MODELS = ['Echo', 'Robot', 'Weirdo', 'Thinker'];

export function buildPlaygroundHtml() {
    return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>LLM Debugger Playground</title>
  ${FONT_LINKS}
  <style>
    :root {
      color-scheme: light;
      --ink: #1a1c1b;
      --muted: #5a645f;
      --accent: #e4572e;
      --accent-2: #2f7e7a;
      --accent-3: #f7b267;
      --panel: #ffffff;
      --paper: #f7f2e8;
      --border: #d6cbb9;
      --shadow: 0 20px 45px rgba(26, 28, 27, 0.1);
      --mono: "IBM Plex Mono", monospace;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: "Space Grotesk", sans-serif;
      color: var(--ink);
      background:
        radial-gradient(900px 420px at 8% -10%, #f7c9ae 0%, transparent 60%),
        radial-gradient(700px 500px at 90% 10%, #bfe7db 0%, transparent 60%),
        linear-gradient(180deg, #f9f4ea 0%, #f2ede2 100%);
      min-height: 100vh;
    }
    .page {
      max-width: 1200px;
      margin: 0 auto;
      padding: 32px 20px 60px;
    }
    .hero {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      margin-bottom: 24px;
    }
    .hero h1 {
      margin: 0;
      font-size: clamp(28px, 4vw, 40px);
      letter-spacing: -0.02em;
    }
    .hero p {
      margin: 4px 0 0;
      color: var(--muted);
      max-width: 560px;
    }
    .hero .actions {
      display: flex;
      gap: 10px;
    }
    .hero a {
      text-decoration: none;
      color: var(--ink);
      border: 1px solid var(--border);
      padding: 8px 14px;
      border-radius: 999px;
      background: var(--panel);
    }
    .hero a:hover {
      border-color: var(--accent);
      color: var(--accent);
    }
    .grid {
      display: grid;
      grid-template-columns: minmax(280px, 1fr) minmax(280px, 1fr);
      gap: 20px;
    }
    .card {
      background: var(--panel);
      border: 1px solid var(--border);
      border-radius: 18px;
      padding: 20px;
      box-shadow: var(--shadow);
      animation: rise 0.6s ease both;
    }
    .card:nth-child(2) { animation-delay: 0.08s; }
    @keyframes rise {
      from { opacity: 0; transform: translateY(14px); }
      to { opacity: 1; transform: translateY(0); }
    }
    .section-title {
      font-size: 13px;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: var(--muted);
      margin-bottom: 12px;
    }
    label {
      display: block;
      font-size: 13px;
      color: var(--muted);
      margin-bottom: 6px;
    }
    input, select, textarea, button {
      font: inherit;
    }
    input, select, textarea {
      width: 100%;
      padding: 10px 12px;
      border-radius: 12px;
      border: 1px solid var(--border);
      background: #fff;
    }
    textarea {
      resize: vertical;
      min-height: 90px;
      font-family: var(--mono);
      font-size: 13px;
    }
    .field {
      margin-bottom: 14px;
    }
    .row {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
      gap: 12px;
    }
    .chip {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 6px 10px;
      border-radius: 999px;
      background: var(--paper);
      border: 1px solid var(--border);
      font-size: 12px;
      color: var(--muted);
    }
    .buttons {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      margin-top: 6px;
    }
    button {
      border: none;
      border-radius: 999px;
      padding: 10px 18px;
      cursor: pointer;
      background: var(--accent);
      color: #fff;
      font-weight: 600;
    }
    button.secondary {
      background: var(--accent-2);
    }
    button.ghost {
      background: transparent;
      color: var(--ink);
      border: 1px solid var(--border);
    }
    button:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }
    .output {
      display: grid;
      gap: 16px;
    }
    .stream {
      border-radius: 14px;
      border: 1px solid var(--border);
      padding: 14px;
      background: #fff;
      min-height: 180px;
      white-space: pre-wrap;
      font-family: var(--mono);
      font-size: 13px;
    }
    .event-log {
      border-radius: 14px;
      border: 1px solid var(--border);
      padding: 14px;
      background: #1f2623;
      color: #f6f1e8;
      min-height: 200px;
      white-space: pre-wrap;
      font-family: var(--mono);
      font-size: 12px;
      overflow: auto;
    }
    .status {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      font-size: 12px;
      color: var(--muted);
    }
    .status strong {
      color: var(--ink);
    }
    .status .dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--accent-2);
    }
    .status .dot.idle { background: #c4b8a8; }
    .status .dot.busy { background: var(--accent); }
    .status .dot.done { background: var(--accent-2); }
    .status .dot.error { background: #c23b22; }
    @media (max-width: 960px) {
      .grid { grid-template-columns: 1fr; }
      .hero { align-items: flex-start; }
    }
  </style>
</head>
<body>
  <main class="page">
    <header class="hero">
      <div>
        <h1>Streaming Playground</h1>
        <p>Shape, stream, and inspect LLM responses across providers. Pick a preset, edit the JSON, and watch the live output.</p>
      </div>
      <div class="actions">
        <a href="/">Index</a>
        <a href="/explore">Explore</a>
        <a href="/openapi.json">OpenAPI</a>
      </div>
    </header>

    <section class="grid">
      <div class="card">
        <div class="section-title">Request Builder</div>
        <div class="field">
          <label for="preset">Preset</label>
          <select id="preset"></select>
        </div>
        <div class="row">
          <div class="field">
            <label for="baseUrl">Base URL</label>
            <input id="baseUrl" type="text" />
          </div>
          <div class="field">
            <label for="endpoint">Endpoint</label>
            <input id="endpoint" type="text" />
          </div>
        </div>
        <div class="row">
          <div class="field">
            <label for="method">Method</label>
            <select id="method">
              <option>POST</option>
              <option>GET</option>
            </select>
          </div>
          <div class="field">
            <label for="authType">Auth Header</label>
            <select id="authType">
              <option value="none">None</option>
              <option value="bearer">Authorization: Bearer</option>
              <option value="apiKey">x-api-key</option>
              <option value="google">x-goog-api-key</option>
            </select>
          </div>
        </div>
        <div class="row">
          <div class="field">
            <label for="authToken">Token</label>
            <input id="authToken" type="password" placeholder="optional" />
          </div>
          <div class="field">
            <label for="modelInput">Model</label>
            <input id="modelInput" type="text" />
          </div>
        </div>
        <div class="field">
          <label for="promptInput">Prompt</label>
          <textarea id="promptInput" rows="3"></textarea>
          <div class="buttons">
            <button class="ghost" id="applyPrompt">Apply to JSON</button>
            <span class="chip" id="pathHint">POST /v1/chat/completions</span>
          </div>
        </div>
        <div class="field">
          <label for="bodyInput">Body (JSON)</label>
          <textarea id="bodyInput" rows="12"></textarea>
        </div>
        <div class="buttons">
          <button id="sendBtn">Stream</button>
          <button class="secondary" id="stopBtn" disabled>Stop</button>
          <button class="ghost" id="clearBtn">Clear</button>
        </div>
      </div>

      <div class="card output">
        <div class="status">
          <div class="chip"><span class="dot idle" id="statusDot"></span><strong id="statusText">Idle</strong></div>
          <div id="statusMeta">Waiting for a request.</div>
        </div>
        <div>
          <div class="section-title">Assistant Stream</div>
          <div id="streamText" class="stream"></div>
        </div>
        <div>
          <div class="section-title">Event Log</div>
          <div id="eventLog" class="event-log"></div>
        </div>
      </div>
    </section>
  </main>

  <script>
    const presets = {
      openaiChat: {
        label: "OpenAI Chat (SSE)",
        method: "POST",
        pathTemplate: "/v1/chat/completions",
        model: "Echo",
        prompt: "Say hello from the playground.",
        buildBody: (model, prompt) => ({
          model,
          messages: [{ role: "user", content: prompt }],
          stream: true
        })
      },
      openaiResponses: {
        label: "OpenAI Responses (SSE)",
        method: "POST",
        pathTemplate: "/v1/responses",
        model: "Echo",
        prompt: "Summarize what this server does in one sentence.",
        buildBody: (model, prompt) => ({
          model,
          input: prompt,
          stream: true
        })
      },
      anthropicMessages: {
        label: "Anthropic Messages (SSE)",
        method: "POST",
        pathTemplate: "/v1/messages",
        model: "Echo",
        prompt: "Give me a short creative greeting.",
        buildBody: (model, prompt) => ({
          model,
          max_tokens: 64,
          messages: [{ role: "user", content: prompt }],
          stream: true
        })
      },
      geminiStream: {
        label: "Gemini Stream (SSE)",
        method: "POST",
        pathTemplate: "/v1beta/models/{model}:streamGenerateContent",
        model: "echo",
        prompt: "Write a tiny poem about debugging.",
        buildBody: (model, prompt) => ({
          contents: [{ role: "user", parts: [{ text: prompt }] }]
        })
      },
      geminiNdjson: {
        label: "Gemini Stream (NDJSON)",
        method: "POST",
        pathTemplate: "/v1beta/models/{model}:streamGenerateContent?stream_format=ndjson",
        model: "echo",
        prompt: "List three qualities of a great test harness.",
        buildBody: (model, prompt) => ({
          contents: [{ role: "user", parts: [{ text: prompt }] }]
        })
      }
    };

    const presetSelect = document.getElementById("preset");
    const baseUrlInput = document.getElementById("baseUrl");
    const endpointInput = document.getElementById("endpoint");
    const methodSelect = document.getElementById("method");
    const authTypeSelect = document.getElementById("authType");
    const authTokenInput = document.getElementById("authToken");
    const modelInput = document.getElementById("modelInput");
    const promptInput = document.getElementById("promptInput");
    const bodyInput = document.getElementById("bodyInput");
    const applyPromptBtn = document.getElementById("applyPrompt");
    const sendBtn = document.getElementById("sendBtn");
    const stopBtn = document.getElementById("stopBtn");
    const clearBtn = document.getElementById("clearBtn");
    const streamText = document.getElementById("streamText");
    const eventLog = document.getElementById("eventLog");
    const statusText = document.getElementById("statusText");
    const statusMeta = document.getElementById("statusMeta");
    const statusDot = document.getElementById("statusDot");
    const pathHint = document.getElementById("pathHint");

    let activeController = null;

    function setStatus(state, message) {
      statusText.textContent = state;
      statusMeta.textContent = message || "";
      statusDot.className = "dot " + state.toLowerCase();
    }

    function updatePathHint() {
      const method = methodSelect.value || "POST";
      const endpoint = endpointInput.value || "/";
      pathHint.textContent = method + " " + endpoint;
    }

    function renderPath(template, model) {
      if (!template) return "";
      return template.replace("{model}", model || "echo");
    }

    function applyPreset(key) {
      const preset = presets[key];
      if (!preset) return;
      methodSelect.value = preset.method;
      modelInput.value = preset.model;
      promptInput.value = preset.prompt;
      endpointInput.value = renderPath(preset.pathTemplate, preset.model);
      bodyInput.value = JSON.stringify(preset.buildBody(preset.model, preset.prompt), null, 2);
      updatePathHint();
    }

    function applyPromptToBody() {
      const preset = presets[presetSelect.value];
      if (!preset) return;
      const model = modelInput.value.trim() || preset.model;
      const prompt = promptInput.value.trim() || preset.prompt;
      endpointInput.value = renderPath(preset.pathTemplate, model);
      bodyInput.value = JSON.stringify(preset.buildBody(model, prompt), null, 2);
      updatePathHint();
    }

    function readJsonBody() {
      const text = bodyInput.value.trim();
      if (!text) return null;
      return JSON.parse(text);
    }

    function buildHeaders() {
      const headers = { "Content-Type": "application/json" };
      const authType = authTypeSelect.value;
      const token = authTokenInput.value.trim();
      if (authType !== "none" && token) {
        if (authType === "bearer") {
          headers.Authorization = "Bearer " + token;
        } else if (authType === "apiKey") {
          headers["x-api-key"] = token;
        } else if (authType === "google") {
          headers["x-goog-api-key"] = token;
        }
      }
      return headers;
    }

    function appendEvent(text) {
      eventLog.textContent += text + "\\n";
      eventLog.scrollTop = eventLog.scrollHeight;
    }

    function appendStream(text) {
      if (!text) return;
      streamText.textContent += text;
      streamText.scrollTop = streamText.scrollHeight;
    }

    function extractText(eventName, payload) {
      if (!payload) return "";
      if (typeof payload === "string") return payload;
      if (payload.type === "response.output_text.delta" && typeof payload.delta === "string") {
        return payload.delta;
      }
      if (payload.choices && payload.choices[0]?.delta?.content) {
        return payload.choices[0].delta.content;
      }
      if (payload.choices && payload.choices[0]?.delta?.reasoning_content) {
        return payload.choices[0].delta.reasoning_content;
      }
      if (payload.choices && payload.choices[0]?.message?.content) {
        return payload.choices[0].message.content;
      }
      if (payload.delta?.text) {
        return payload.delta.text;
      }
      if (payload.content && Array.isArray(payload.content)) {
        const text = payload.content.map((part) => part.text || "").join("");
        if (text) return text;
      }
      if (payload.candidates?.[0]?.content?.parts) {
        return payload.candidates[0].content.parts.map((part) => part.text || "").join("");
      }
      if (payload.output && Array.isArray(payload.output)) {
        const outputs = payload.output
          .map((entry) => entry.content || [])
          .flat()
          .map((part) => part.text || "");
        const joined = outputs.join("");
        if (joined) return joined;
      }
      return "";
    }

    function handleParsedEvent(eventName, payload) {
      if (payload === "[DONE]") {
        appendEvent("data: [DONE]");
        return;
      }
      if (payload && typeof payload === "object") {
        appendEvent((eventName ? "event: " + eventName + "\\n" : "") + JSON.stringify(payload, null, 2));
        appendStream(extractText(eventName, payload));
      } else if (payload) {
        appendEvent((eventName ? "event: " + eventName + "\\n" : "") + String(payload));
      }
    }

    async function readSseStream(response) {
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\\n\\n");
        buffer = parts.pop() || "";
        for (const part of parts) {
          const lines = part.split("\\n");
          let eventName = "";
          const dataLines = [];
          for (const line of lines) {
            if (line.startsWith("event:")) {
              eventName = line.slice(6).trim();
            } else if (line.startsWith("data:")) {
              dataLines.push(line.slice(5).trim());
            }
          }
          const dataText = dataLines.join("\\n");
          if (!dataText) continue;
          if (dataText === "[DONE]") {
            handleParsedEvent(eventName, "[DONE]");
            continue;
          }
          try {
            const parsed = JSON.parse(dataText);
            handleParsedEvent(eventName, parsed);
          } catch {
            handleParsedEvent(eventName, dataText);
          }
        }
      }
    }

    async function readNdjsonStream(response) {
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const parsed = JSON.parse(line);
            handleParsedEvent("", parsed);
          } catch {
            handleParsedEvent("", line);
          }
        }
      }
    }

    async function streamRequest() {
      if (activeController) {
        activeController.abort();
      }
      streamText.textContent = "";
      eventLog.textContent = "";
      setStatus("busy", "Connecting to stream...");
      sendBtn.disabled = true;
      stopBtn.disabled = false;

      const url = (baseUrlInput.value || "").replace(/\\/+$/, "") + endpointInput.value;
      const headers = buildHeaders();
      const method = methodSelect.value || "POST";
      let body = null;

      if (method !== "GET") {
        try {
          body = JSON.stringify(readJsonBody() || {});
        } catch (error) {
          setStatus("error", "Invalid JSON body.");
          sendBtn.disabled = false;
          stopBtn.disabled = true;
          return;
        }
      }

      const controller = new AbortController();
      activeController = controller;

      try {
        const response = await fetch(url, { method, headers, body, signal: controller.signal });
        if (!response.ok) {
          const errorText = await response.text();
          setStatus("error", "HTTP " + response.status + " " + response.statusText);
          appendEvent(errorText || "Request failed.");
          sendBtn.disabled = false;
          stopBtn.disabled = true;
          return;
        }

        const contentType = response.headers.get("content-type") || "";
        const isNdjson = contentType.includes("application/x-ndjson");
        const isSse = contentType.includes("text/event-stream");

        if (!response.body || (!isSse && !isNdjson)) {
          const data = await response.json();
          appendEvent(JSON.stringify(data, null, 2));
          appendStream(extractText("", data));
          setStatus("done", "Response complete.");
          sendBtn.disabled = false;
          stopBtn.disabled = true;
          return;
        }

        if (isNdjson) {
          await readNdjsonStream(response);
        } else {
          await readSseStream(response);
        }
        setStatus("done", "Stream complete.");
      } catch (error) {
        if (error.name === "AbortError") {
          setStatus("idle", "Stream aborted.");
        } else {
          setStatus("error", error.message || "Stream error.");
        }
      } finally {
        sendBtn.disabled = false;
        stopBtn.disabled = true;
        activeController = null;
      }
    }

    function stopStream() {
      if (activeController) {
        activeController.abort();
      }
    }

    function clearOutput() {
      streamText.textContent = "";
      eventLog.textContent = "";
      setStatus("idle", "Waiting for a request.");
    }

    Object.entries(presets).forEach(([key, preset]) => {
      const option = document.createElement("option");
      option.value = key;
      option.textContent = preset.label;
      presetSelect.appendChild(option);
    });

    baseUrlInput.value = window.location.origin;
    presetSelect.value = "openaiChat";
    applyPreset("openaiChat");
    updatePathHint();
    setStatus("idle", "Waiting for a request.");

    presetSelect.addEventListener("change", () => applyPreset(presetSelect.value));
    applyPromptBtn.addEventListener("click", applyPromptToBody);
    endpointInput.addEventListener("input", updatePathHint);
    methodSelect.addEventListener("change", updatePathHint);
    sendBtn.addEventListener("click", streamRequest);
    stopBtn.addEventListener("click", stopStream);
    clearBtn.addEventListener("click", clearOutput);
  </script>
</body>
</html>`;
}

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

export function buildIndexHtml({ config, endpoints, baseUrl }) {
    const resolvedBaseUrl = baseUrl || `http://${config?.host ?? 'localhost'}:${config?.port ?? ''}`;
    const endpointGroups = endpoints && typeof endpoints === 'object' ? endpoints : {};
    const groupLabels = {
        core: 'Core',
        openai: 'OpenAI',
        anthropic: 'Anthropic',
        gemini: 'Gemini',
        geminiOpenAiCompat: 'Gemini OpenAI Compat',
    };

    const formatGroupLabel = (key) => {
        if (groupLabels[key]) return groupLabels[key];
        return String(key)
            .replace(/([a-z])([A-Z])/g, '$1 $2')
            .replace(/\b\w/g, (char) => char.toUpperCase());
    };

    const splitEndpoint = (line) => {
        const firstSpace = line.indexOf(' ');
        if (firstSpace === -1) {
            return { method: '', path: line, note: '' };
        }
        const method = line.slice(0, firstSpace);
        let path = line.slice(firstSpace + 1);
        let note = '';
        const noteStart = path.indexOf(' (');
        if (noteStart !== -1 && path.endsWith(')')) {
            note = path.slice(noteStart + 2, -1);
            path = path.slice(0, noteStart);
        }
        return { method, path, note };
    };

    const cards = Object.entries(endpointGroups).map(([group, items]) => {
        const list = Array.isArray(items) ? items : [];
        const rows = list.length
            ? list.map((line) => {
                const { method, path, note } = splitEndpoint(String(line));
                const methodClass = method ? ` method-${method.toLowerCase()}` : '';
                const noteMarkup = note ? `<span class="note">${escapeHtml(note)}</span>` : '';
                return (
                    '<li class="endpoint">' +
                      '<span class="method' + methodClass + '">' + escapeHtml(method) + '</span>' +
                      '<span class="path">' + escapeHtml(path) + noteMarkup + '</span>' +
                    '</li>'
                );
            }).join('')
            : '<li class="empty">No endpoints configured.</li>';

        return (
            '<article class="card">' +
              '<div class="section-title">' + escapeHtml(formatGroupLabel(group)) + '</div>' +
              '<ul class="endpoint-list">' + rows + '</ul>' +
            '</article>'
        );
    }).join('');

    const content = cards || '<div class="empty">No endpoints configured.</div>';

    return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>LLM Debugger Server</title>
  ${FONT_LINKS}
  <style>
    :root {
      color-scheme: light;
      --ink: #1a1c1b;
      --muted: #5a645f;
      --accent: #e4572e;
      --accent-2: #2f7e7a;
      --panel: #ffffff;
      --paper: #f7f2e8;
      --border: #d6cbb9;
      --shadow: 0 20px 45px rgba(26, 28, 27, 0.1);
      --mono: "IBM Plex Mono", monospace;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: "Space Grotesk", sans-serif;
      color: var(--ink);
      background:
        radial-gradient(900px 420px at 8% -10%, #f7c9ae 0%, transparent 60%),
        radial-gradient(700px 500px at 90% 10%, #bfe7db 0%, transparent 60%),
        linear-gradient(180deg, #f9f4ea 0%, #f2ede2 100%);
      min-height: 100vh;
    }
    .page {
      max-width: 1200px;
      margin: 0 auto;
      padding: 32px 20px 64px;
    }
    .hero {
      display: flex;
      flex-wrap: wrap;
      align-items: flex-end;
      justify-content: space-between;
      gap: 18px;
      margin-bottom: 24px;
    }
    .hero h1 {
      margin: 0;
      font-size: clamp(30px, 4vw, 46px);
      letter-spacing: -0.02em;
    }
    .hero p {
      margin: 6px 0 0;
      color: var(--muted);
      max-width: 560px;
    }
    .hero code {
      font-family: var(--mono);
      background: #fff;
      border-radius: 999px;
      padding: 3px 10px;
      border: 1px solid var(--border);
    }
    .hero .actions {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
    }
    .hero a {
      text-decoration: none;
      color: var(--ink);
      border: 1px solid var(--border);
      padding: 8px 14px;
      border-radius: 999px;
      background: var(--panel);
    }
    .hero a:hover {
      border-color: var(--accent);
      color: var(--accent);
    }
    .grid {
      display: grid;
      grid-template-columns: 1fr;
      gap: 16px;
      max-width: 980px;
      margin: 0 auto;
    }
    .card {
      background: var(--panel);
      border: 1px solid var(--border);
      border-radius: 18px;
      padding: 20px;
      box-shadow: var(--shadow);
      animation: rise 0.6s ease both;
    }
    .card:nth-child(2) { animation-delay: 0.08s; }
    @keyframes rise {
      from { opacity: 0; transform: translateY(14px); }
      to { opacity: 1; transform: translateY(0); }
    }
    .section-title {
      font-size: 13px;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: var(--muted);
      margin-bottom: 12px;
    }
    .endpoint-list {
      list-style: none;
      padding: 0;
      margin: 0;
      display: grid;
      gap: 8px;
    }
    .endpoint {
      display: grid;
      grid-template-columns: 1fr;
      gap: 6px;
      align-items: start;
      border-bottom: 1px dashed var(--border);
      padding-bottom: 6px;
    }
    .endpoint:last-child {
      border-bottom: none;
      padding-bottom: 0;
    }
    .method {
      font-size: 11px;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      font-weight: 600;
      padding: 3px 8px;
      border-radius: 999px;
      background: #f2ede2;
      color: var(--muted);
      width: fit-content;
    }
    .method-post {
      background: #fbe2d0;
      color: #8b3b14;
    }
    .method-get {
      background: #dcefe6;
      color: #1f5b4d;
    }
    .method-delete {
      background: #f6d1d1;
      color: #7a1d1d;
    }
    .path {
      font-family: var(--mono);
      font-size: 13px;
      color: var(--ink);
      overflow-wrap: anywhere;
      word-break: break-word;
    }
    .note {
      display: inline-block;
      margin-left: 8px;
      font-size: 11px;
      color: var(--muted);
    }
    .empty {
      padding: 12px 0;
      color: var(--muted);
    }
    .hint {
      margin-top: 20px;
      font-size: 12px;
      color: var(--muted);
    }
    @media (max-width: 980px) {
      .hero { align-items: flex-start; }
    }
  </style>
</head>
<body>
  <main class="page">
    <header class="hero">
      <div>
        <h1>LLM Debugger Server</h1>
        <p>Base URL: <code>${escapeHtml(resolvedBaseUrl)}</code></p>
      </div>
      <div class="actions">
        <a href="/playground">Playground</a>
        <a href="/explore">Explore</a>
        <a href="/openapi.json">OpenAPI</a>
      </div>
    </header>

    <section class="grid">
      ${content}
    </section>

    <div class="hint">Need JSON? Open <code>/?format=json</code>.</div>
  </main>
</body>
</html>`;
}

function truncateText(value, maxLength = 80) {
    const text = String(value ?? '');
    if (text.length <= maxLength) return text;
    return text.slice(0, Math.max(0, maxLength - 3)) + '...';
}

function formatInlineResponse(response) {
    if (response === null || response === undefined) return 'null';
    if (typeof response === 'string') return JSON.stringify(truncateText(response, 120));
    if (typeof response !== 'object') return String(response);
    const type = response.type ? String(response.type) : '';
    if (type === 'message') {
        const parts = ['message'];
        if (response.content) {
            parts.push(`content=${JSON.stringify(truncateText(response.content, 80))}`);
        }
        if (response.reasoning) {
            parts.push(`reasoning=${JSON.stringify(truncateText(response.reasoning, 80))}`);
        }
        if (Array.isArray(response.tool_calls) && response.tool_calls.length) {
            const tools = response.tool_calls.map((tool) => tool?.name).filter(Boolean).join(', ');
            if (tools) {
                parts.push(`tools=${JSON.stringify(truncateText(tools, 60))}`);
            }
        }
        return parts.join(' ');
    }
    if (type === 'error') {
        const status = response.status ? ` ${response.status}` : '';
        const message = response.message ? ` ${JSON.stringify(truncateText(response.message, 80))}` : '';
        return `error${status}${message}`;
    }
    if (type === 'file') {
        return response.path ? `file ${response.path}` : 'file';
    }
    if (type) return type;
    const json = JSON.stringify(response);
    return truncateText(json, 140);
}

function formatRulesValue(value) {
    if (value === null || value === undefined) return 'null';
    if (typeof value === 'string') return JSON.stringify(truncateText(value, 120));
    if (typeof value !== 'object') return String(value);
    const json = JSON.stringify(value);
    return truncateText(json, 160);
}

function buildExploreData(config) {
    const modelNames = listModelNames(config.modelRegistry, { excludeBaseModels: true });
    const listedModels = modelNames.length ? modelNames : BUILTIN_MODELS;
    const models = [];
    const seen = new Set();

    for (const name of listedModels) {
        if (config.modelRegistry.triggerModels.has(name)) {
            const entry = config.modelRegistry.triggerModels.get(name);
            const entries = [];
            for (const item of entry.entries) {
                entries.push({
                    label: typeof item.match === 'string' ? item.match : JSON.stringify(item.match),
                    outcome: formatInlineResponse(item.response),
                    isDefault: false,
                });
            }
            if (entry.defaultEntry) {
                entries.push({
                    label: '_default',
                    outcome: formatInlineResponse(entry.defaultEntry.response),
                    isDefault: true,
                });
            }
            models.push({
                name,
                kind: 'trigger',
                parent: entry.parent || null,
                entries,
            });
        } else if (config.modelRegistry.behaviorModels.has(name)) {
            const entry = config.modelRegistry.behaviorModels.get(name);
            const entries = [];
            if (entry.behavior) {
                entries.push({ label: 'behavior', outcome: JSON.stringify(entry.behavior) });
            }
            if (entry.script) {
                entries.push({ label: 'script', outcome: JSON.stringify(entry.script) });
            }
            if (entry.rules) {
                entries.push({ label: 'rules', outcome: formatRulesValue(entry.rules) });
            }
            if (!entries.length) {
                entries.push({ label: 'behavior', outcome: 'configured', isDefault: true });
            }
            models.push({
                name,
                kind: 'behavior',
                entries,
            });
        } else {
            models.push({
                name,
                kind: 'builtin',
                entries: [{ label: 'builtin', outcome: 'Default server behavior', isDefault: true }],
            });
        }
        seen.add(name);
    }

    const baseModels = Array.from(config.modelRegistry.baseModels || []).filter((name) => !seen.has(name));
    for (const name of baseModels) {
        const entry = config.modelRegistry.triggerModels.get(name);
        const entries = [];
        for (const item of entry?.entries || []) {
            entries.push({
                label: typeof item.match === 'string' ? item.match : JSON.stringify(item.match),
                outcome: formatInlineResponse(item.response),
                isDefault: false,
            });
        }
        if (entry?.defaultEntry) {
            entries.push({
                label: '_default',
                outcome: formatInlineResponse(entry.defaultEntry.response),
                isDefault: true,
            });
        }
        models.push({
            name,
            kind: 'base',
            parent: entry?.parent || null,
            entries,
        });
    }

    models.sort((a, b) => a.name.localeCompare(b.name));

    return {
        models,
    };
}

function safeJsonStringify(value) {
    return JSON.stringify(value).replace(/</g, '\\u003c');
}

export function buildExploreHtml(config) {
    const exploreData = buildExploreData(config);
    const exploreJson = safeJsonStringify(exploreData);

    return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>LLM Debugger Bots</title>
  ${FONT_LINKS}
  <style>
    :root {
      color-scheme: light;
      --ink: #1a1c1b;
      --muted: #5a645f;
      --accent: #e4572e;
      --accent-2: #2f7e7a;
      --accent-3: #f7b267;
      --panel: #ffffff;
      --paper: #f7f2e8;
      --border: #d6cbb9;
      --shadow: 0 20px 45px rgba(26, 28, 27, 0.1);
      --mono: "IBM Plex Mono", monospace;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: "Space Grotesk", sans-serif;
      color: var(--ink);
      background:
        radial-gradient(900px 420px at 8% -10%, #f7c9ae 0%, transparent 60%),
        radial-gradient(700px 500px at 90% 10%, #bfe7db 0%, transparent 60%),
        linear-gradient(180deg, #f9f4ea 0%, #f2ede2 100%);
      min-height: 100vh;
    }
    .page {
      max-width: 1200px;
      margin: 0 auto;
      padding: 32px 20px 64px;
    }
    .hero {
      display: flex;
      flex-wrap: wrap;
      align-items: flex-end;
      justify-content: space-between;
      gap: 18px;
      margin-bottom: 24px;
    }
    .hero h1 {
      margin: 0;
      font-size: clamp(30px, 4vw, 46px);
      letter-spacing: -0.02em;
    }
    .hero p {
      margin: 6px 0 0;
      color: var(--muted);
      max-width: 560px;
    }
    .hero .actions {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
    }
    .hero a {
      text-decoration: none;
      color: var(--ink);
      border: 1px solid var(--border);
      padding: 8px 14px;
      border-radius: 999px;
      background: var(--panel);
    }
    .hero a:hover {
      border-color: var(--accent);
      color: var(--accent);
    }
    .card {
      background: var(--panel);
      border: 1px solid var(--border);
      border-radius: 18px;
      padding: 20px;
      box-shadow: var(--shadow);
      animation: rise 0.6s ease both;
    }
    .card:nth-child(2) { animation-delay: 0.08s; }
    @keyframes rise {
      from { opacity: 0; transform: translateY(14px); }
      to { opacity: 1; transform: translateY(0); }
    }
    .section-title {
      font-size: 13px;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: var(--muted);
      margin-bottom: 12px;
    }
    .models {
      margin-top: 0;
    }
    .model-list {
      display: grid;
      gap: 16px;
    }
    .model-item {
      border: 1px solid var(--border);
      border-radius: 16px;
      padding: 16px;
      background: #fff;
      display: grid;
      gap: 12px;
    }
    .model-header {
      display: flex;
      flex-wrap: wrap;
      align-items: baseline;
      gap: 10px;
    }
    .model-name {
      margin: 0;
      font-size: 18px;
    }
    .model-kind {
      font-size: 11px;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: var(--muted);
    }
    .model-inherit {
      font-size: 12px;
      color: var(--muted);
    }
    .entry-list {
      list-style: none;
      padding: 0;
      margin: 0;
      display: grid;
      gap: 8px;
    }
    .entry {
      display: grid;
      grid-template-columns: minmax(160px, 1fr) 24px minmax(240px, 2fr);
      gap: 8px;
      font-size: 13px;
      align-items: start;
    }
    .entry .label {
      font-family: var(--mono);
      color: var(--muted);
    }
    .entry.default .label {
      color: var(--ink);
      font-weight: 600;
    }
    .entry .arrow {
      color: var(--muted);
      text-align: center;
    }
    .entry .outcome {
      font-family: var(--mono);
      color: var(--ink);
    }
    .empty {
      padding: 16px;
      border-radius: 14px;
      border: 1px dashed var(--border);
      color: var(--muted);
      text-align: center;
    }
    @media (max-width: 980px) {
      .hero { align-items: flex-start; }
    }
    @media (max-width: 820px) {
      .entry {
        grid-template-columns: 1fr;
      }
      .entry .arrow {
        display: none;
      }
    }
  </style>
</head>
<body>
  <main class="page">
    <header class="hero">
      <div>
        <h1>Bots</h1>
        <p>Single-column list of configured bots with supported messages and outcomes.</p>
      </div>
      <div class="actions">
        <a href="/">Index</a>
        <a href="/playground">Playground</a>
        <a href="/openapi.json">OpenAPI</a>
      </div>
    </header>

    <section class="models">
      <div class="card">
        <div class="section-title">Bots</div>
        <div id="modelsList" class="model-list"></div>
      </div>
    </section>
  </main>
  <script>
    const exploreData = ${exploreJson};
    const modelsList = document.getElementById("modelsList");

    function escapeHtml(value) {
      return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
    }

    function renderModels() {
      const models = Array.isArray(exploreData.models) ? exploreData.models : [];
      if (!models.length) {
        modelsList.innerHTML = '<div class="empty">No bots configured.</div>';
        return;
      }
      modelsList.innerHTML = models.map((model) => {
        const kind = escapeHtml(model.kind || 'model');
        const inheritText = model.parent ? 'inherits ' + escapeHtml(model.parent) : '';
        const entries = Array.isArray(model.entries) ? model.entries : [];
        const listItems = entries.length
          ? entries.map((item) => {
              const label = escapeHtml(item.label || '');
              const outcome = escapeHtml(item.outcome || '');
              const isDefault = item.isDefault ? ' default' : '';
              return (
                '<li class="entry' + isDefault + '">' +
                  '<span class="label">' + label + '</span>' +
                  '<span class="arrow">-></span>' +
                  '<span class="outcome">' + outcome + '</span>' +
                '</li>'
              );
            }).join("")
          : '<li class="entry"><span class="label">_default</span><span class="arrow">-></span><span class="outcome">No triggers configured.</span></li>';

        return (
          '<article class="model-item">' +
            '<div class="model-header">' +
              '<h3 class="model-name">' + escapeHtml(model.name) + '</h3>' +
              '<span class="model-kind">' + kind + '</span>' +
              (inheritText ? '<span class="model-inherit">' + inheritText + '</span>' : '') +
            '</div>' +
            '<ul class="entry-list">' + listItems + '</ul>' +
          '</article>'
        );
      }).join("");
    }

    renderModels();
  </script>
</body>
</html>`;
}
