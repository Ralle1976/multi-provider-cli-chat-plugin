# Internal Notes – Multi-Provider CLI Chat Plugin

## Design Goals

- Use ChatGPT and Gemini via their official CLIs, not via direct paid APIs.
- Delegate all authentication and billing to:
  - `codex` from `@openai/codex`
  - `gemini` from `@google-gemini/gemini-cli`
- Provide clear, structured failures so Claude Code does not keep spawning subagents on rate limits.

## Command Protocol

Both commands read a JSON object from `stdin`:

- Required: `prompt` (string)
- Optional: `model` (string)

They write a JSON object to `stdout`:

- On success:
  - `provider`: `"codex"` or `"gemini"`
  - `success`: `true`
  - `output`: CLI stdout (trimmed)

- On failure:
  - `provider`: `"codex"` or `"gemini"`
  - `success`: `false`
  - `error_type`: `"auth" | "limit" | "missing" | "error"`
  - `message`: human-readable explanation

Exit codes:

- `0` for success.
- Non-zero for any failure so that Claude Code treats the command as failed.

## Error Detection Heuristics

We currently treat the following stderr patterns as special:

- **Auth errors**:
  - Phrases like `not logged in`, `please run codex login`, `please run gemini login`,
    `authentication`, `unauthorized`.

- **Rate/Quota/Billing errors**:
  - Phrases like `rate limit`, `quota`, `billing hard limit`, `insufficient_quota`.

- **Missing CLI**:
  - `ENOENT` from `execFile`, meaning `codex`/`gemini` is not on `PATH`.

For all other cases, the error is classified as `error` and full stderr is included in the message.

## Future Ideas

- Add optional JSON/text output mode selection.
- Support provider selection via a single aggregated command.
- Add lightweight unit tests for the error parsing helpers.

