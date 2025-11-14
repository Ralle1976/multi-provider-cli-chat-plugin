# Multi-Provider CLI Chat Plugin

This Claude Code plugin routes prompts to locally installed CLIs:

- `codex` from `@openai/codex` (ChatGPT/OpenAI account, no direct API key usage in this plugin)
- `gemini` CLI (Google Gemini account, no direct API key usage in this plugin)

Authentication, billing, and rate limits are all handled by the respective CLIs. The plugin only shells out to these tools and interprets their stdout/stderr.

## Requirements

- Node.js installiert
- Claude Code global installiert (`npm install -g @anthropic-ai/claude-code`)
- `codex` CLI im `PATH` (üblicherweise über `npm install -g @openai/codex` installiert)
- `gemini` CLI im `PATH` (laut README des `gemini-cli`-Repositories installiert und mit deinem Google-Account verknüpft)

## Authentifizierung – Überblick

Der Plugin-Code selbst hat **keinerlei Zugriff** auf Passwörter oder API-Keys. Stattdessen wird zu 100 % auf die bestehenden Logins der beiden CLIs gesetzt:

- Codex / ChatGPT: Authentifizierung erfolgt über `codex login` und die interne Konfiguration der Codex-CLI.
- Gemini: Authentifizierung erfolgt über den Login-/Konfigurations-Flow der `gemini` CLI (z.B. bei der Erstbenutzung oder mit einem separaten Login-Kommando, je nach Version).

Wenn du bereits über dein Benutzerkonto in beiden CLIs angemeldet bist, funktioniert das Plugin direkt ohne zusätzliche Schlüssel.

## Authentifizierung – Schritt für Schritt

### 1. OpenAI / Codex (ChatGPT-Account)

1. Stelle sicher, dass die Codex-CLI installiert ist:
   ```bash
   which codex
   codex --help
   ```
2. Führe im Ubuntu-Terminal **(nicht in Claude)** einmalig aus:
   ```bash
   codex login
   ```
3. Folge dem Login-Flow (Browser / Code). Danach speichert `codex` deine Session lokal.

Das Plugin ruft später nur das `codex`-Binary auf und nutzt diese bestehende Session. Es werden **keine** API-Keys im Plugin gespeichert.

### 2. Gemini (Gemini-Account)

1. Stelle sicher, dass die `gemini` CLI installiert ist:
   ```bash
   which gemini
   gemini --help
   ```
2. Richte die Authentifizierung so ein, wie es die `gemini` CLI vorgibt (z.B. beim ersten Start oder über ein eigenes Login-Kommando wie `gemini login`, falls verfügbar).
3. Sobald ein einfacher Aufruf wie
   ```bash
   gemini "Testprompt"
   ```
   im Terminal funktioniert, ist Gemini für das Plugin einsatzbereit.

Auch hier verwendet das Plugin ausschließlich die gespeicherte Konfiguration der `gemini` CLI.

## Commands

### `/openai-cli`

Sendet ein Prompt an die Codex-CLI:

- Intern wird `codex exec <prompt>` verwendet.
- Optionaler `model`-Parameter wird über `-m` an Codex weitergegeben.
- Typische Modelle:
  - `o3-mini`
  - `gpt-4.1`
  - `gpt-4.1-mini`

Beispiel-Aufruf in Claude:

```text
/openai-cli { "prompt": "Erkläre Quicksort kurz.", "model": "o3-mini" }
```

### `/gemini-cli`

Sendet ein Prompt an die Gemini-CLI:

- Intern wird `gemini <prompt>` mit dem Prompt als Positionsargument verwendet.
- Optionaler `model`-Parameter wird über `--model` übergeben.
- Typische Modelle:
  - `gemini-2.5-pro`
  - `gemini-2.0-pro`
  - `gemini-2.0-flash`

Beispiel-Aufruf in Claude:

```text
/gemini-cli { "prompt": "Fasse diese Sitzung zusammen.", "model": "gemini-2.5-pro" }
```

## Error and Rate Limit Handling

The plugin inspects CLI stderr to detect:

- Authentication problems (e.g. “not logged in”, “please run codex login/gemini login”).
- Quota / rate limit / billing-limit errors.
- Missing CLI binaries (not installed or not on PATH).

When a limit or auth error is detected:

- The plugin returns a structured JSON response with `success: false` and an `error_type` of `auth`, `limit`, or `missing`.
- Exit code is non-zero so that Claude Code does **not** blindly retry subagents.

Other unexpected errors are reported as `error_type: "error"` with the original stderr included for debugging.

### Verhalten bei Fehlern in Claude

Die JSON-Antworten werden von Claude (oder deinen eigenen Tools) interpretiert:

- `error_type: "auth"`:
  - Weist darauf hin, dass eine Anmeldung / Konfiguration in der jeweiligen CLI fehlt oder abgelaufen ist.
  - Lösung:
    - Codex: `codex login` im Terminal ausführen.
    - Gemini: die in der `gemini` CLI dokumentierte Login-/Konfiguration erneut durchführen.

- `error_type: "limit"`:
  - Bedeutet, dass dein Kontingent oder Rate-Limit für diesen Provider erreicht ist.
  - Verhalten:
    - Einen anderen Provider (Claude oder den jeweils anderen CLI-Provider) für weitere Subagent-Aufgaben nutzen.
    - **Keine** automatischen Endlosschleifen mit neuen Subagenten auf demselben Provider.

- `error_type: "missing"`:
  - Die CLI (`codex` oder `gemini`) wurde nicht gefunden.
  - Lösung:
    - Installation prüfen und sicherstellen, dass das Binary im `PATH` liegt.

Auf diese Weise bleibt das Limit- und Fehlerverhalten transparent, und das Plugin verhindert, dass Claude immer wieder sinnlos neue Subagenten startet, wenn ein Provider bereits blockiert ist.
