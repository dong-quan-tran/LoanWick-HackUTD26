# Worker step 1: clock tool smoke

This package is only step 1 of `docs/team-plans/03-AI-WORKER-AND-INGESTION.md`.

It runs one harmless local tool, `read_worker_clock`, through either a deterministic fixture provider or a live NVIDIA chat completion. It does not connect to a database, persist findings, or accept documents. `connectedDatabase` is always `false`.

## Modes

`AGENT_MODE=fixture` (the default) never calls the network. The fixture model id is the literal `fixture`.

`AGENT_MODE=live` calls NVIDIA and stays live if that call fails. It does not switch to the fixture provider.

The smoke result's `executionMode` comes from the provider, not from the model's sentence.

## Live API

Documented shape used here:

- Chat completions: https://docs.api.nvidia.com/nim/reference/nvidia-nemotron-3_5-bolt-e4b-infer
- Tool calling: https://docs.nvidia.com/nim/large-language-models/latest/function-calling.html

Request: `POST {NVIDIA_BASE_URL}/chat/completions` with `Authorization: Bearer`. The default base URL is `https://integrate.api.nvidia.com/v1`.

`tool_choice` is `"auto"`. `parallel_tool_calls` is `false`, so the request asks for one tool call. If a response still contains more than one, the worker rejects it before running any of them. `max_tokens` is 512 and `temperature` is 0. `top_p` is left unset because the NVIDIA page says not to set both. Instructions stay on the `system` role, which the OpenAI-compatible NIM docs use. Reasoning fields on the response are ignored and not stored.

`NVIDIA_MODEL` is required. The code does not fill one in. The Nemotron sample for this project uses `nvidia/nemotron-3-nano-omni-30b-a3b-reasoning`. That sample is a vision prompt; the worker sends text and one tool instead of an image. Optional `NVIDIA_MAX_TOKENS`, `NVIDIA_TEMPERATURE`, `NVIDIA_TOP_P`, and `NVIDIA_REASONING_BUDGET` are copied onto the request when set. `reasoning_budget` cannot be larger than `NVIDIA_MAX_TOKENS`.

Redirects are refused so the bearer token is not forwarded to another host.

A self-hosted Brev NIM can use the same client by setting `NVIDIA_BASE_URL` to that instance's `https://.../v1` URL. An `http://` URL is rejected.

## Commands

From `apps/worker`:

```text
npm install
npm test
npm run typecheck
npm run smoke
```

`npm run smoke` reads `apps/worker/.env` without printing it. Copy `.env.example` and fill `NVIDIA_API_KEY` and `NVIDIA_MODEL` before a live run. Do not commit `.env`.

## Storage

`WORKER_UPLOAD_DIR` is recorded for a later intake step. This step does not create that directory or write files. Worker-local file storage, when it exists, is development-only.
