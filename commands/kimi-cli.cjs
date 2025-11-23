#!/usr/bin/env node

/**
 * kimi-cli.cjs - Kimi CLI Integration fuer Claude Code
 *
 * Nutzt die offizielle Kimi CLI (MoonshotAI/kimi-cli) fuer Anfragen.
 * Die CLI muss installiert und konfiguriert sein:
 *   uv tool install --python 3.13 kimi-cli
 *   kimi  # dann /setup ausfuehren
 *
 * Oder Config manuell erstellen in ~/.kimi/config.json
 *
 * Eingabe (JSON):
 *   {
 *     "prompt": "Erklaere Quicksort",
 *     "model": "kimi-latest",
 *     "yolo": true
 *   }
 */

const { spawn } = require("node:child_process");
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");

const DEFAULT_MODEL = "kimi-latest";

// Verfuegbare Modelle (Kimi For Coding Platform)
const AVAILABLE_MODELS = {
  "kimi-latest": { context: "128K", description: "Kimi Latest (EMPFOHLEN)" },
  "kimi-thinking": { context: "128K", description: "Kimi mit erweitertem Reasoning" },
};

/**
 * Prueft ob die Kimi CLI installiert ist
 */
function findKimiCLI() {
  const possiblePaths = [
    path.join(os.homedir(), ".local", "bin", "kimi"),
    "/usr/local/bin/kimi",
    "/usr/bin/kimi",
  ];

  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      return p;
    }
  }

  // Fallback: im PATH suchen
  const pathDirs = (process.env.PATH || "").split(":");
  for (const dir of pathDirs) {
    const fullPath = path.join(dir, "kimi");
    if (fs.existsSync(fullPath)) {
      return fullPath;
    }
  }

  return null;
}

/**
 * Prueft ob Kimi CLI konfiguriert ist
 */
function isKimiConfigured() {
  const configPath = path.join(os.homedir(), ".kimi", "config.json");
  if (!fs.existsSync(configPath)) {
    return { configured: false, reason: "config_missing" };
  }

  try {
    const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
    if (!config.default_model || Object.keys(config.providers || {}).length === 0) {
      return { configured: false, reason: "no_provider" };
    }
    return { configured: true };
  } catch (err) {
    return { configured: false, reason: "config_invalid" };
  }
}

/**
 * Ruft Kimi CLI im Print-Modus auf
 */
function callKimiCLI(prompt, model, yolo) {
  return new Promise((resolve) => {
    const kimiPath = findKimiCLI();

    if (!kimiPath) {
      resolve({
        ok: false,
        type: "missing",
        message:
          "Kimi CLI nicht gefunden. Installieren mit:\n  uv tool install --python 3.13 kimi-cli"
      });
      return;
    }

    const configStatus = isKimiConfigured();
    if (!configStatus.configured) {
      let msg = "Kimi CLI nicht konfiguriert. ";
      if (configStatus.reason === "config_missing") {
        msg += "Fuehre aus: kimi -> /setup";
      } else if (configStatus.reason === "no_provider") {
        msg += "Kein Provider konfiguriert. Fuehre /setup in kimi CLI aus.";
      } else {
        msg += "Config-Datei ungueltig. Loesche ~/.kimi/config.json und fuehre /setup aus.";
      }
      resolve({
        ok: false,
        type: "auth",
        message: msg
      });
      return;
    }

    // Argumente fuer Kimi CLI
    const args = [
      "-w", "/tmp",  // Work-Dir um Home-Dir Probleme zu vermeiden
      "-c", prompt,
      "--print",
      "--output-format", "text"
    ];

    // Model angeben falls nicht default
    if (model && model !== DEFAULT_MODEL) {
      args.push("-m", model);
    }

    // YOLO-Modus (auto-approve)
    if (yolo) {
      args.push("--yolo");
    }

    let stdout = "";
    let stderr = "";

    const child = spawn(kimiPath, args, {
      timeout: 120000,  // 2 Minuten Timeout
      env: { ...process.env }
    });

    child.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    child.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    child.on("close", (code) => {
      // Parse Output - Kimi CLI gibt strukturierten Output
      // Format: "TextPart(type='text', text='...')" oder plain text

      let outputText = stdout.trim();

      // Extrahiere Text aus TextPart - kann mehrzeilig sein
      // Format: TextPart(type='text', text='...')
      const textParts = [];
      const textPartRegex = /TextPart\(\s*type='text',\s*text='([\s\S]*?)'\s*\)/g;
      let match;
      while ((match = textPartRegex.exec(outputText)) !== null) {
        textParts.push(match[1]);
      }

      if (textParts.length > 0) {
        outputText = textParts.join("\n");
      } else {
        // Fallback: Entferne Metadata-Zeilen
        outputText = outputText
          .split("\n")
          .filter(line => {
            const trimmed = line.trim();
            return (
              !trimmed.startsWith("StepBegin(") &&
              !trimmed.startsWith("StatusUpdate(") &&
              !trimmed.startsWith("ToolCall(") &&
              !trimmed.startsWith("ToolResult(") &&
              !trimmed.startsWith("TextPart(") &&
              !trimmed.match(/^type='text'/) &&
              !trimmed.match(/^text='/) &&
              !trimmed.match(/^\)$/) &&
              !trimmed.match(/^[A-Z][a-zA-Z]+\(/)
            );
          })
          .join("\n");
      }

      outputText = outputText.trim();

      if (code !== 0 && !outputText) {
        // Pruefe auf spezifische Fehler
        const combinedOutput = stdout + stderr;

        if (combinedOutput.includes("LLM not set")) {
          resolve({
            ok: false,
            type: "auth",
            message: "Kimi CLI nicht konfiguriert. Fuehre aus: kimi -> /setup"
          });
          return;
        }

        if (combinedOutput.includes("rate limit") || combinedOutput.includes("429")) {
          resolve({
            ok: false,
            type: "limit",
            message: "Kimi API Rate-Limit erreicht. Bitte spaeter erneut versuchen."
          });
          return;
        }

        if (combinedOutput.includes("authentication") || combinedOutput.includes("401")) {
          resolve({
            ok: false,
            type: "auth",
            message: "Kimi API Authentifizierung fehlgeschlagen. Pruefe ~/.kimi/config.json"
          });
          return;
        }

        resolve({
          ok: false,
          type: "error",
          message: `Kimi CLI Fehler (exit ${code}): ${stderr || stdout || "Unbekannter Fehler"}`
        });
        return;
      }

      resolve({
        ok: true,
        output: outputText || "(Leere Antwort)",
        model: model || DEFAULT_MODEL
      });
    });

    child.on("error", (error) => {
      resolve({
        ok: false,
        type: "error",
        message: `Kimi CLI Fehler: ${error.message}`
      });
    });
  });
}

async function main() {
  const inputChunks = [];
  for await (const chunk of process.stdin) {
    inputChunks.push(chunk);
  }

  let payload;
  try {
    payload = JSON.parse(Buffer.concat(inputChunks).toString("utf8") || "{}");
  } catch (err) {
    console.error("Failed to parse JSON input:", err.message);
    process.exit(1);
  }

  // Sonderbehandlung: Liste verfuegbare Modelle
  if (payload.action === "list-models") {
    const response = {
      provider: "kimi",
      success: true,
      models: AVAILABLE_MODELS,
      default: DEFAULT_MODEL,
      cli_path: findKimiCLI(),
      configured: isKimiConfigured()
    };
    process.stdout.write(JSON.stringify(response, null, 2));
    return;
  }

  // Sonderbehandlung: Status pruefen
  if (payload.action === "status") {
    const kimiPath = findKimiCLI();
    const configStatus = isKimiConfigured();

    const response = {
      provider: "kimi",
      success: true,
      cli_installed: !!kimiPath,
      cli_path: kimiPath,
      configured: configStatus.configured,
      config_status: configStatus.reason || "ok",
      config_path: path.join(os.homedir(), ".kimi", "config.json")
    };
    process.stdout.write(JSON.stringify(response, null, 2));
    return;
  }

  const prompt = payload.prompt;
  const model = payload.model || DEFAULT_MODEL;
  const yolo = payload.yolo !== false;  // Default: true

  if (!prompt || typeof prompt !== "string") {
    const response = {
      provider: "kimi",
      success: false,
      error_type: "missing_prompt",
      message: "Fehlendes `prompt` Feld. Beispiel: {\"prompt\": \"Erklaere Quicksort\", \"model\": \"kimi-latest\"}"
    };
    process.stdout.write(JSON.stringify(response, null, 2));
    process.exit(1);
  }

  const result = await callKimiCLI(prompt, model, yolo);

  if (!result.ok) {
    const response = {
      provider: "kimi",
      success: false,
      error_type: result.type,
      message: result.message
    };
    process.stdout.write(JSON.stringify(response, null, 2));
    process.exit(1);
  }

  const response = {
    provider: "kimi",
    success: true,
    output: result.output,
    model: result.model
  };

  process.stdout.write(JSON.stringify(response, null, 2));
}

main().catch((err) => {
  console.error("Unexpected error in kimi-cli:", err);
  process.exit(1);
});
