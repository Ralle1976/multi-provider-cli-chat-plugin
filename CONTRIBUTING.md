# Contributing to Multi-Provider CLI Chat Plugin

This plugin is designed to route Claude Code prompts to local CLIs (`codex`, `gemini`) without handling API keys directly.

## Development Setup

- Use a recent Node.js version (same as for Claude Code).
- Ensure both CLIs are installed and on `PATH`:
  - `npm install -g @openai/codex`
  - `npm install -g @google-gemini/gemini-cli`
- Log in to each CLI before testing:
  - `codex login`
  - `gemini login`

## Testing the Commands

From the plugin root (`claude-code-multimodel/plugins/multi-provider-cli-chat`):

- Test Codex:
  - `echo '{\"prompt\":\"test from codex\"}' | node commands/openai-cli.js`
- Test Gemini:
  - `echo '{\"prompt\":\"test from gemini\"}' | node commands/gemini-cli.js`

Check that:

- Successful responses print JSON with `success: true` and `output`.
- Missing CLI, auth issues, or limits produce `success: false` and a specific `error_type`.

## Error and Limit Handling

When changing error detection:

- Keep rate-limit / quota detection conservative (do not silently swallow errors).
- Always return a non-zero exit code for failures so that Claude Code does not retry endlessly.
- Prefer explicit messages that guide the user (e.g. suggest `codex login` or `gemini login`).

## Coding Style

- Use plain Node.js (no extra dependencies) for the command scripts.
- Keep the JSON protocol simple and stable (`provider`, `success`, `output` or `message`, `error_type`).
- Avoid adding direct HTTP/API calls; all model interaction should go through the official CLIs.

