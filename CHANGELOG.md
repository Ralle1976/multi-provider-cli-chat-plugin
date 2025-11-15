# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - 2025-11-15

### Added
- Initial release of multi-provider-cli-chat plugin
- `/openai-cli` command for OpenAI Codex integration
  - Support for model selection (`o3-mini`, `gpt-4.1`, `gpt-4.1-mini`)
  - Sandbox modes: `read-only`, `workspace-write`, `danger-full-access`
  - Approval policies: `untrusted`, `on-failure`, `on-request`, `never`
- `/gemini-cli` command for Google Gemini integration
  - Support for model selection (`gemini-2.5-pro`, `gemini-2.0-pro`, `gemini-2.0-flash`)
  - YOLO mode for confirmation-free execution
  - Approval modes: `default`, `auto_edit`, `yolo`
- Structured error handling with error types:
  - `auth`: Authentication/login required
  - `limit`: Rate limit or quota reached
  - `missing`: CLI tool not installed
  - `error`: General execution errors
- Account-based authentication (no API keys stored in plugin)
- Comprehensive documentation:
  - README.md with setup instructions
  - CLAUDE_PLUGIN_INTEGRATION.md for project integration
  - CONTRIBUTING.md for contributors
  - NOTES.md for additional context

### Security
- No API keys or credentials stored in plugin code
- All authentication handled by respective CLI tools
- Token-free git remote configuration

[Unreleased]: https://github.com/Ralle1976/multi-provider-cli-chat-plugin/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/Ralle1976/multi-provider-cli-chat-plugin/releases/tag/v0.1.0
