#!/usr/bin/env node

/**
 * kimi-auth.cjs - Kimi CLI Authentifizierung pruefen/einrichten
 *
 * Eingabe (JSON):
 *   {}                                      - Prueft aktuelle Authentifizierung
 *   { "action": "test" }                    - Testet API-Verbindung via CLI
 *   { "action": "help" }                    - Zeigt Einrichtungsanleitung
 *
 * Die Kimi CLI verwendet ~/.kimi/config.json fuer die Konfiguration.
 * Setup erfolgt interaktiv via: kimi -> /setup
 */

const { spawn, execSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

const CONFIG_FILE = path.join(os.homedir(), ".kimi", "config.json");

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
 * Holt Kimi CLI Version
 */
function getKimiVersion() {
  try {
    const kimiPath = findKimiCLI();
    if (!kimiPath) return null;
    const output = execSync(`"${kimiPath}" --version 2>&1`, { encoding: "utf8", timeout: 5000 });
    const match = output.match(/version\s+([\d.]+)/i);
    return match ? match[1] : output.trim();
  } catch {
    return null;
  }
}

/**
 * Prueft ob Kimi CLI konfiguriert ist
 */
function checkConfig() {
  if (!fs.existsSync(CONFIG_FILE)) {
    return {
      configured: false,
      reason: "config_missing",
      message: "Config-Datei nicht vorhanden"
    };
  }

  try {
    const config = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8"));

    if (!config.default_model) {
      return {
        configured: false,
        reason: "no_default_model",
        message: "Kein Standard-Modell konfiguriert"
      };
    }

    if (!config.providers || Object.keys(config.providers).length === 0) {
      return {
        configured: false,
        reason: "no_provider",
        message: "Kein Provider konfiguriert"
      };
    }

    // Pruefe ob API-Key gesetzt ist
    const providerNames = Object.keys(config.providers);
    const firstProvider = config.providers[providerNames[0]];

    if (!firstProvider.api_key) {
      return {
        configured: false,
        reason: "no_api_key",
        message: "Kein API-Key im Provider konfiguriert"
      };
    }

    // Maskiere API-Key fuer Anzeige
    const apiKey = firstProvider.api_key;
    const masked = apiKey.length > 12
      ? apiKey.substring(0, 8) + "..." + apiKey.substring(apiKey.length - 4)
      : "***";

    return {
      configured: true,
      default_model: config.default_model,
      provider: providerNames[0],
      base_url: firstProvider.base_url,
      key_preview: masked,
      models: Object.keys(config.models || {})
    };
  } catch (err) {
    return {
      configured: false,
      reason: "config_invalid",
      message: `Config-Datei ungueltig: ${err.message}`
    };
  }
}

/**
 * Testet die Kimi CLI Verbindung
 */
function testConnection() {
  return new Promise((resolve) => {
    const kimiPath = findKimiCLI();

    if (!kimiPath) {
      resolve({
        success: false,
        error: "cli_missing",
        message: "Kimi CLI nicht installiert"
      });
      return;
    }

    const configStatus = checkConfig();
    if (!configStatus.configured) {
      resolve({
        success: false,
        error: "not_configured",
        message: configStatus.message,
        hint: "Fuehre aus: kimi -> dann /setup"
      });
      return;
    }

    // Teste mit einem simplen Prompt
    const child = spawn(kimiPath, [
      "-w", "/tmp",
      "-c", "Say OK",
      "--print",
      "--output-format", "text"
    ], {
      timeout: 30000,
      env: { ...process.env }
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (data) => { stdout += data.toString(); });
    child.stderr.on("data", (data) => { stderr += data.toString(); });

    child.on("close", (code) => {
      const combined = stdout + stderr;

      if (combined.includes("LLM not set")) {
        resolve({
          success: false,
          error: "not_configured",
          message: "LLM nicht konfiguriert",
          hint: "Fuehre aus: kimi -> dann /setup"
        });
        return;
      }

      if (combined.includes("authentication") || combined.includes("401") || combined.includes("403")) {
        resolve({
          success: false,
          error: "auth_failed",
          message: "API-Key ungueltig",
          hint: "Fuehre erneut /setup in kimi CLI aus"
        });
        return;
      }

      if (combined.includes("rate limit") || combined.includes("429")) {
        resolve({
          success: false,
          error: "rate_limit",
          message: "Rate-Limit erreicht"
        });
        return;
      }

      // Pruefe auf erfolgreiche Antwort
      if (stdout.includes("TextPart") || stdout.toLowerCase().includes("ok") || code === 0) {
        resolve({
          success: true,
          message: "Verbindung erfolgreich! Kimi CLI ist einsatzbereit."
        });
        return;
      }

      resolve({
        success: false,
        error: "unknown",
        message: `Test fehlgeschlagen (exit ${code}): ${stderr || stdout || "Keine Ausgabe"}`
      });
    });

    child.on("error", (error) => {
      resolve({
        success: false,
        error: "spawn_error",
        message: `CLI-Fehler: ${error.message}`
      });
    });
  });
}

async function readStdinJson() {
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    return {};
  }
}

function getSetupGuide() {
  return {
    success: true,
    provider: "kimi",
    setup_guide: {
      title: "Kimi CLI Einrichtung",
      prerequisites: [
        "Python 3.13+ und uv installiert"
      ],
      steps: [
        "1. Installiere Kimi CLI:",
        "   uv tool install --python 3.13 kimi-cli",
        "",
        "2. Starte Kimi CLI:",
        "   kimi",
        "",
        "3. Fuehre Setup aus (im interaktiven Modus):",
        "   /setup",
        "",
        "4. Waehle 'Kimi For Coding' als Platform",
        "",
        "5. Gib deinen API-Key von kimi.com ein",
        "   (Settings -> API Keys auf kimi.com)",
        "",
        "6. Waehle ein Modell (z.B. kimi-latest)"
      ],
      platforms: {
        "kimi-for-coding": {
          name: "Kimi For Coding (kimi.com)",
          base_url: "https://api.kimi.com/coding/v1",
          note: "Fuer kimi.com Accounts (EMPFOHLEN)"
        },
        "moonshot-cn": {
          name: "Moonshot AI China",
          base_url: "https://api.moonshot.cn/v1",
          note: "Fuer platform.moonshot.cn Accounts"
        },
        "moonshot-ai": {
          name: "Moonshot AI Global",
          base_url: "https://api.moonshot.ai/v1",
          note: "Fuer platform.moonshot.ai Accounts"
        }
      },
      config_file: CONFIG_FILE,
      verification: "Nach dem Setup: /kimi-auth {\"action\": \"test\"}"
    }
  };
}

async function main() {
  const payload = await readStdinJson();
  const action = payload.action || "status";

  const kimiPath = findKimiCLI();
  const kimiVersion = getKimiVersion();

  switch (action) {
    case "status":
      const configStatus = checkConfig();

      console.log(JSON.stringify({
        success: true,
        provider: "kimi",
        cli: {
          installed: !!kimiPath,
          path: kimiPath,
          version: kimiVersion
        },
        config: configStatus,
        config_file: CONFIG_FILE,
        next_steps: !kimiPath
          ? "Installiere mit: uv tool install --python 3.13 kimi-cli"
          : !configStatus.configured
            ? "Fuehre aus: kimi -> dann /setup eingeben"
            : "Teste mit: /kimi-auth {\"action\": \"test\"}",
        available_models: configStatus.configured ? configStatus.models : []
      }, null, 2));
      break;

    case "test":
      if (!kimiPath) {
        console.log(JSON.stringify({
          success: false,
          provider: "kimi",
          error: "cli_missing",
          message: "Kimi CLI nicht installiert",
          install: "uv tool install --python 3.13 kimi-cli"
        }, null, 2));
        break;
      }

      console.error("Teste Kimi CLI Verbindung...");
      const testResult = await testConnection();

      if (testResult.success) {
        console.log(JSON.stringify({
          success: true,
          provider: "kimi",
          status: "authenticated",
          message: testResult.message,
          ready_to_use: true,
          commands: {
            slash_command: "/kimi-cli {\"prompt\": \"Hello\"}",
            info: "Claude kann jetzt auf Kimi zugreifen"
          }
        }, null, 2));
      } else {
        console.log(JSON.stringify({
          success: false,
          provider: "kimi",
          error: testResult.error,
          message: testResult.message,
          hint: testResult.hint,
          help: "/kimi-auth {\"action\": \"help\"}"
        }, null, 2));
      }
      break;

    case "help":
      console.log(JSON.stringify(getSetupGuide(), null, 2));
      break;

    default:
      console.log(JSON.stringify({
        success: false,
        error: "invalid_action",
        message: `Unbekannte Aktion: ${action}`,
        available_actions: ["status", "test", "help"],
        note: "API-Key Setup erfolgt interaktiv via: kimi -> /setup"
      }, null, 2));
  }
}

main().catch((err) => {
  console.log(JSON.stringify({
    success: false,
    error: "unexpected_error",
    message: err.message
  }, null, 2));
});
