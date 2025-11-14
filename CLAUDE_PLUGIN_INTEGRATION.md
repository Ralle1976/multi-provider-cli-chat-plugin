# Claude Code Integration Guide - Multi-Provider CLI Plugin

Diese Datei kannst du in deine **CLAUDE.md** (Projekt-Leitfaden) einbinden, um Claude beizubringen, wie es dieses Plugin als Subagent verwenden soll.

## Verlinken in deiner CLAUDE.md

Füge in deiner Projekt-CLAUDE.md einfach folgenden Abschnitt hinzu:

```markdown
## 🌐 Externe Modelle über CLI-Plugin (OpenAI/Codex & Gemini)

Dieses System nutzt ein lokales Claude Code Plugin, um zusätzliche Modelle über deren offizielle CLIs einzubinden – ohne direkte API-Keys im Code.

**Plugin-Repository**: https://github.com/Ralle1976/multi-provider-cli-chat-plugin

**Vollständige Integration-Anweisungen**: Siehe [CLAUDE_PLUGIN_INTEGRATION.md](https://github.com/Ralle1976/multi-provider-cli-chat-plugin/blob/main/CLAUDE_PLUGIN_INTEGRATION.md)
```

---

## 📋 Für Claude: Plugin-Nutzung als Subagent

### Installation & Setup

1. **Plugin installieren**:
   ```bash
   # Clone das Plugin-Repository
   git clone https://github.com/Ralle1976/multi-provider-cli-chat-plugin.git

   # Oder: Installiere es als lokales Plugin in deinem Projekt
   mkdir -p YOUR_PROJECT/plugins
   cd YOUR_PROJECT/plugins
   git clone https://github.com/Ralle1976/multi-provider-cli-chat-plugin.git
   ```

2. **Plugin in Claude Code aktivieren**:

   Füge in deiner globalen Claude-Konfiguration (`~/.claude/settings.json`) oder projekt-spezifischen `.claude/settings.json` hinzu:

   ```json
   {
     "plugins": {
       "local": [
         {
           "path": "ABSOLUTE_PATH_TO_PLUGIN_FOLDER",
           "enabled": true
         }
       ]
     }
   }
   ```

   Ersetze `ABSOLUTE_PATH_TO_PLUGIN_FOLDER` mit dem tatsächlichen Pfad, z.B.:
   - Linux/Mac: `/home/username/projects/plugins/multi-provider-cli-chat-plugin`
   - Windows: `C:\\Users\\username\\projects\\plugins\\multi-provider-cli-chat-plugin`

3. **CLI-Tools authentifizieren**:

   - **Codex/OpenAI**: `codex login` im Terminal ausführen
   - **Gemini**: Auth gemäß `gemini` CLI-Dokumentation

---

### Verfügbare Slash-Commands (Subagent-Routing)

#### `/openai-cli`

- **Routed zu**: OpenAI Codex CLI (`codex` Binary, ChatGPT-/OpenAI-Account)
- **Eingabe** (JSON-Objekt):
  - `prompt` (string, Pflicht) – vollständige Benutzeranfrage
  - `model` (string, optional) – bevorzugte OpenAI-Modelle:
    - `o3-mini`
    - `gpt-4.1`
    - `gpt-4.1-mini`
  - `sandbox` (string, optional) – Sandbox-Modus für Codex:
    - `read-only` – Nur Lese-Zugriff
    - `workspace-write` – Schreibzugriff im Workspace
    - `danger-full-access` – Voller Zugriff (YOLO-Modus)
  - `approval_policy` (string, optional) – Genehmigungsrichtlinie:
    - `untrusted` – Bei nicht vertrauenswürdigen Aktionen fragen
    - `on-failure` – Bei Fehlern fragen
    - `on-request` – Auf Anfrage fragen
    - `never` – Niemals fragen (YOLO-Modus)

- **Verwendung**:
  - Wenn der Benutzer explizit `OpenAI`, `ChatGPT`, `Codex`, `o3-mini` o.ä. anfordert
  - Für Cross-Checks / zweite Meinung neben Claude/Gemini

**Beispiel** (Standard):
```text
/openai-cli { "prompt": "Erkläre Quicksort in Python", "model": "o3-mini" }
```

**Beispiel** (YOLO-Modus - volle Rechte, keine Nachfragen):
```text
/openai-cli {
  "prompt": "Analysiere und optimiere den Code",
  "model": "o3-mini",
  "sandbox": "danger-full-access",
  "approval_policy": "never"
}
```

#### `/gemini-cli`

- **Routed zu**: Gemini CLI (`gemini` Binary, Google Gemini-Account)
- **Eingabe** (JSON-Objekt):
  - `prompt` (string, Pflicht)
  - `model` (string, optional) – bevorzugte Gemini-Modelle:
    - `gemini-2.5-pro`
    - `gemini-2.0-pro`
    - `gemini-2.0-flash`
  - `yolo` (boolean, optional) – YOLO-Modus aktivieren:
    - `true` – Wird intern zu `--approval-mode=yolo` konvertiert
    - `false` – Standardverhalten
  - `approval_mode` (string, optional) – Genehmigungsmodus (hat Priorität über `yolo`):
    - `default` – Standard-Genehmigung
    - `auto_edit` – Automatische Edits erlauben
    - `yolo` – YOLO-Modus (keine Nachfragen)

- **Wichtig**: Die Gemini CLI erlaubt nicht `--yolo` und `--approval-mode` gleichzeitig. Das Plugin konvertiert `yolo: true` automatisch zu `--approval-mode=yolo`. Wenn beide Parameter gesetzt sind, hat `approval_mode` Priorität.

- **Verwendung**:
  - Wenn der Benutzer explizit `Gemini` oder eines der oben genannten Modelle anfordert
  - Für Cross-Checks / Spezialfälle, in denen Gemini bevorzugt wird

**Beispiel** (Standard):
```text
/gemini-cli { "prompt": "Fasse diese Sitzung zusammen", "model": "gemini-2.5-pro" }
```

**Beispiel** (YOLO-Modus - Variante 1 mit approval_mode):
```text
/gemini-cli {
  "prompt": "Refactore den gesamten Bot-Code",
  "model": "gemini-2.5-pro",
  "approval_mode": "yolo"
}
```

**Beispiel** (YOLO-Modus - Variante 2 mit yolo-Flag):
```text
/gemini-cli {
  "prompt": "Refactore den gesamten Bot-Code",
  "model": "gemini-2.5-pro",
  "yolo": true
}
```

---

### Subagent-Strategie & Provider-Wahl

**Standard**:
- Nutze **Claude** für Analyse, Planung, Codeänderungen und primäre Antworten

**Nutze `/openai-cli`**:
- Nur wenn ausdrücklich ein OpenAI-/ChatGPT-Modell angefordert oder ein Vergleich mit OpenAI gewünscht ist

**Nutze `/gemini-cli`**:
- Nur wenn ausdrücklich ein Gemini-Modell angefordert oder ein Vergleich mit Gemini gewünscht ist

**Verwende so wenige externe Aufrufe wie nötig; keine unnötigen Kaskaden von Subagenten**

---

### Fehler- und Limitverhalten (SEHR WICHTIG)

Beide Commands liefern strukturierte JSON-Antworten:

#### Erfolg:
```json
{
  "provider": "codex" | "gemini",
  "success": true,
  "output": "..."
}
```

#### Fehler:
```json
{
  "provider": "...",
  "success": false,
  "error_type": "auth" | "limit" | "missing" | "error",
  "message": "..."
}
```

#### Verhalten bei Fehlern:

1. **`error_type: "auth"`**:
   - Benutzer informieren, dass im Terminal ein Login / eine Konfiguration nötig ist
     - Codex: `codex login` (im Terminal, **nicht** in Claude)
     - Gemini: Authentifizierung über die `gemini` CLI, wie bereits eingerichtet
   - **Nicht** automatisch wiederholt versuchen; Benutzeranweisung abwarten

2. **`error_type: "limit"`**:
   - Melden, dass das Kontingent / Rate-Limit für diesen Provider erreicht ist
   - Für diese Sitzung einen anderen Provider nutzen (z.B. Claude oder den jeweils anderen CLI-Provider)
   - **Keine** Endlosschleifen mit Subagenten oder wiederholte CLI-Aufrufe

3. **`error_type: "missing"`**:
   - Erläutern, dass das jeweilige CLI-Tool (`codex` oder `gemini`) nicht installiert oder nicht im `PATH` ist
   - Benutzer ggf. auf Installation hinweisen:
     - Codex: `npm install -g @openai/codex`
     - Gemini: siehe https://github.com/google/generative-ai-cli (oder entsprechendes Repository)

4. **`error_type: "error"`**:
   - Fehlertext kurz zusammenfassen
   - Nur dann einen erneuten Versuch starten, wenn es sich klar um einen transienten Fehler handelt (z.B. temporärer Netzwerkfehler)

**Allgemein**:
- Externe Modelle sind **Ergänzung**, kein Ersatz für Claude
- Multi-Agent-Workflows können diese Commands gezielt als Tools/Subagenten verwenden, sollen aber Limits und Fehler strikt respektieren

---

## 🔐 Sicherheit & Best Practices

- **Keine API-Keys im Code**: Das Plugin nutzt ausschließlich die bestehenden CLI-Logins
- **Keine Credentials in Git**: Niemals Tokens oder Keys committen
- **Rate-Limiting respektieren**: Bei `limit`-Fehlern Provider wechseln, nicht wiederholen
- **Lokale Pfade nicht committen**: In projekt-spezifischen CLAUDE.md immer relative oder generische Pfadangaben verwenden

---

## 📚 Weitere Ressourcen

- **Plugin-Repository**: https://github.com/Ralle1976/multi-provider-cli-chat-plugin
- **README.md**: Detaillierte Installations- und Authentifizierungsanleitungen
- **CONTRIBUTING.md**: Entwickler-Setup und Testbefehle
- **NOTES.md**: Internes Protokoll, Fehlerheuristik, Designziele

---

## 🎯 Beispiel: Integration in deine CLAUDE.md

```markdown
# Dein Projekt - Claude Development Guide

## 🌐 Externe Modelle über CLI-Plugin

Dieses Projekt nutzt das Multi-Provider CLI Chat Plugin für Claude Code.

**Plugin-Repository**: https://github.com/Ralle1976/multi-provider-cli-chat-plugin

### Setup (einmalig):

1. Plugin klonen und in `~/.claude/settings.json` aktivieren
2. `codex login` für OpenAI ausführen
3. Gemini CLI authentifizieren

### Verwendung:

- `/openai-cli { "prompt": "...", "model": "o3-mini" }`
- `/gemini-cli { "prompt": "...", "model": "gemini-2.5-pro" }`

**Vollständige Anweisungen**: [CLAUDE_PLUGIN_INTEGRATION.md](https://github.com/Ralle1976/multi-provider-cli-chat-plugin/blob/main/CLAUDE_PLUGIN_INTEGRATION.md)
```

---

**Das wars!** Diese Datei kannst du in beliebige Projekte verlinken, ohne lokale Pfade zu exponieren.
