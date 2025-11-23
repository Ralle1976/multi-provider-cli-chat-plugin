#!/usr/bin/env node

/**
 * gemini-accounts.cjs - Multi-Account Gemini Verwaltung
 *
 * Verwaltet mehrere Gemini/Google AI Accounts fuer automatische Rotation
 * bei Rate-Limits.
 *
 * Aktionen:
 *   add     - Account hinzufuegen
 *   remove  - Account entfernen
 *   list    - Alle Accounts anzeigen
 *   status  - Aktueller Account + Usage
 *   set     - Aktuellen Account manuell setzen
 *   rotate  - Zum naechsten Account wechseln
 *   strategy - Rotations-Strategie aendern
 *
 * Account-Typen:
 *   free - Kostenloser Account (15 RPM Flash, 2 RPM Pro, 1500 RPD)
 *   paid - Bezahlter Account (hoehere Limits)
 *
 * Strategien:
 *   paid_first  - Paid-Accounts bevorzugen (Zuverlaessigkeit)
 *   free_first  - Free-Accounts zuerst (Kosten sparen)
 *   round_robin - Gleichmaessig verteilen
 */

const fs = require("node:fs");
const path = require("path");

const CONFIG_DIR = path.join(process.env.HOME, ".claude");
const ACCOUNTS_FILE = path.join(CONFIG_DIR, "gemini_accounts.json");
const USAGE_FILE = path.join(CONFIG_DIR, "gemini_usage.json");

// Default Konfiguration
const DEFAULT_CONFIG = {
  accounts: [],
  current_index: 0,
  strategy: "free_first" // free_first, paid_first, round_robin
};

// Gemini Free Tier Limits (Stand 2025)
const FREE_LIMITS = {
  "gemini-1.5-flash": { rpm: 15, rpd: 1500 },
  "gemini-1.5-pro": { rpm: 2, rpd: 50 },
  "gemini-2.0-flash": { rpm: 15, rpd: 1500 },
  "gemini-3.0-flash": { rpm: 15, rpd: 1500 },
  "gemini-3-pro-preview": { rpm: 2, rpd: 50 }
};

function ensureConfigDir() {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }
}

function loadConfig() {
  ensureConfigDir();
  if (fs.existsSync(ACCOUNTS_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(ACCOUNTS_FILE, "utf8"));
    } catch {
      return { ...DEFAULT_CONFIG };
    }
  }
  return { ...DEFAULT_CONFIG };
}

function saveConfig(config) {
  ensureConfigDir();
  fs.writeFileSync(ACCOUNTS_FILE, JSON.stringify(config, null, 2));
}

function loadUsage() {
  if (fs.existsSync(USAGE_FILE)) {
    try {
      const usage = JSON.parse(fs.readFileSync(USAGE_FILE, "utf8"));
      // Reset daily counters if new day
      const today = new Date().toISOString().split("T")[0];
      if (usage.date !== today) {
        return { date: today, accounts: {} };
      }
      return usage;
    } catch {
      return { date: new Date().toISOString().split("T")[0], accounts: {} };
    }
  }
  return { date: new Date().toISOString().split("T")[0], accounts: {} };
}

function saveUsage(usage) {
  ensureConfigDir();
  fs.writeFileSync(USAGE_FILE, JSON.stringify(usage, null, 2));
}

function maskApiKey(key) {
  if (!key || key.length < 12) return "***";
  return key.substring(0, 6) + "..." + key.substring(key.length - 4);
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

function addAccount(config, name, apiKey, type, priority) {
  // Pruefe ob Name bereits existiert
  if (config.accounts.find(a => a.name === name)) {
    return {
      success: false,
      error: "account_exists",
      message: `Account '${name}' existiert bereits`
    };
  }

  const newAccount = {
    name,
    api_key: apiKey,
    type: type || "free",
    priority: priority || config.accounts.length + 1,
    active: true,
    added: new Date().toISOString()
  };

  config.accounts.push(newAccount);

  // Sortiere nach Strategie
  sortAccountsByStrategy(config);

  saveConfig(config);

  return {
    success: true,
    message: `Account '${name}' (${type}) hinzugefuegt`,
    total_accounts: config.accounts.length
  };
}

function removeAccount(config, name) {
  const index = config.accounts.findIndex(a => a.name === name);
  if (index === -1) {
    return {
      success: false,
      error: "not_found",
      message: `Account '${name}' nicht gefunden`
    };
  }

  config.accounts.splice(index, 1);

  // current_index anpassen
  if (config.current_index >= config.accounts.length) {
    config.current_index = Math.max(0, config.accounts.length - 1);
  }

  saveConfig(config);

  return {
    success: true,
    message: `Account '${name}' entfernt`,
    total_accounts: config.accounts.length
  };
}

function sortAccountsByStrategy(config) {
  switch (config.strategy) {
    case "paid_first":
      config.accounts.sort((a, b) => {
        if (a.type === "paid" && b.type === "free") return -1;
        if (a.type === "free" && b.type === "paid") return 1;
        return a.priority - b.priority;
      });
      break;
    case "free_first":
      config.accounts.sort((a, b) => {
        if (a.type === "free" && b.type === "paid") return -1;
        if (a.type === "paid" && b.type === "free") return 1;
        return a.priority - b.priority;
      });
      break;
    case "round_robin":
    default:
      config.accounts.sort((a, b) => a.priority - b.priority);
      break;
  }
}

function rotateToNext(config, usage) {
  if (config.accounts.length === 0) {
    return {
      success: false,
      error: "no_accounts",
      message: "Keine Accounts konfiguriert"
    };
  }

  const startIndex = config.current_index;
  let attempts = 0;

  do {
    config.current_index = (config.current_index + 1) % config.accounts.length;
    attempts++;

    const account = config.accounts[config.current_index];
    if (account.active) {
      saveConfig(config);
      return {
        success: true,
        message: `Gewechselt zu Account '${account.name}'`,
        current: {
          name: account.name,
          type: account.type,
          index: config.current_index
        }
      };
    }
  } while (config.current_index !== startIndex && attempts < config.accounts.length);

  return {
    success: false,
    error: "no_active_accounts",
    message: "Keine aktiven Accounts verfuegbar"
  };
}

function getStatus(config, usage) {
  if (config.accounts.length === 0) {
    return {
      success: true,
      accounts_configured: 0,
      message: "Keine Accounts konfiguriert. Fuege einen hinzu mit: /gemini-accounts {\"action\": \"add\", \"name\": \"...\", \"api_key\": \"...\", \"type\": \"free\"}"
    };
  }

  const current = config.accounts[config.current_index];
  const accountUsage = usage.accounts[current?.name] || { requests: 0 };

  return {
    success: true,
    strategy: config.strategy,
    accounts_configured: config.accounts.length,
    accounts_free: config.accounts.filter(a => a.type === "free").length,
    accounts_paid: config.accounts.filter(a => a.type === "paid").length,
    current_account: current ? {
      name: current.name,
      type: current.type,
      api_key_preview: maskApiKey(current.api_key),
      requests_today: accountUsage.requests,
      active: current.active
    } : null,
    usage_date: usage.date
  };
}

function listAccounts(config, usage) {
  if (config.accounts.length === 0) {
    return {
      success: true,
      accounts: [],
      message: "Keine Accounts konfiguriert"
    };
  }

  const accountList = config.accounts.map((acc, idx) => {
    const accUsage = usage.accounts[acc.name] || { requests: 0 };
    return {
      index: idx,
      name: acc.name,
      type: acc.type,
      api_key_preview: maskApiKey(acc.api_key),
      active: acc.active,
      current: idx === config.current_index,
      requests_today: accUsage.requests,
      priority: acc.priority
    };
  });

  return {
    success: true,
    strategy: config.strategy,
    accounts: accountList,
    total: config.accounts.length
  };
}

async function main() {
  const payload = await readStdinJson();
  const action = payload.action || "status";

  const config = loadConfig();
  const usage = loadUsage();

  switch (action) {
    case "add":
      if (!payload.name || !payload.api_key) {
        console.log(JSON.stringify({
          success: false,
          error: "missing_params",
          message: "Erforderlich: name, api_key. Optional: type (free/paid), priority (Zahl)",
          example: {
            action: "add",
            name: "mein-account",
            api_key: "AIzaSy...",
            type: "free"
          }
        }, null, 2));
        return;
      }
      console.log(JSON.stringify(
        addAccount(config, payload.name, payload.api_key, payload.type, payload.priority),
        null, 2
      ));
      break;

    case "remove":
      if (!payload.name) {
        console.log(JSON.stringify({
          success: false,
          error: "missing_name",
          message: "Account-Name erforderlich"
        }, null, 2));
        return;
      }
      console.log(JSON.stringify(removeAccount(config, payload.name), null, 2));
      break;

    case "list":
      console.log(JSON.stringify(listAccounts(config, usage), null, 2));
      break;

    case "status":
      console.log(JSON.stringify(getStatus(config, usage), null, 2));
      break;

    case "rotate":
      console.log(JSON.stringify(rotateToNext(config, usage), null, 2));
      break;

    case "set":
      if (payload.name) {
        const idx = config.accounts.findIndex(a => a.name === payload.name);
        if (idx === -1) {
          console.log(JSON.stringify({
            success: false,
            error: "not_found",
            message: `Account '${payload.name}' nicht gefunden`
          }, null, 2));
          return;
        }
        config.current_index = idx;
        saveConfig(config);
        console.log(JSON.stringify({
          success: true,
          message: `Aktueller Account: '${payload.name}'`
        }, null, 2));
      } else if (typeof payload.index === "number") {
        if (payload.index < 0 || payload.index >= config.accounts.length) {
          console.log(JSON.stringify({
            success: false,
            error: "invalid_index",
            message: `Index muss zwischen 0 und ${config.accounts.length - 1} sein`
          }, null, 2));
          return;
        }
        config.current_index = payload.index;
        saveConfig(config);
        console.log(JSON.stringify({
          success: true,
          message: `Aktueller Account: '${config.accounts[payload.index].name}'`
        }, null, 2));
      } else {
        console.log(JSON.stringify({
          success: false,
          error: "missing_param",
          message: "name oder index erforderlich"
        }, null, 2));
      }
      break;

    case "strategy":
      if (!payload.strategy) {
        console.log(JSON.stringify({
          success: true,
          current_strategy: config.strategy,
          available: ["free_first", "paid_first", "round_robin"]
        }, null, 2));
        return;
      }
      if (!["free_first", "paid_first", "round_robin"].includes(payload.strategy)) {
        console.log(JSON.stringify({
          success: false,
          error: "invalid_strategy",
          message: "Erlaubt: free_first, paid_first, round_robin"
        }, null, 2));
        return;
      }
      config.strategy = payload.strategy;
      sortAccountsByStrategy(config);
      saveConfig(config);
      console.log(JSON.stringify({
        success: true,
        message: `Strategie geaendert zu: ${payload.strategy}`,
        strategy: payload.strategy
      }, null, 2));
      break;

    case "toggle":
      if (!payload.name) {
        console.log(JSON.stringify({
          success: false,
          error: "missing_name",
          message: "Account-Name erforderlich"
        }, null, 2));
        return;
      }
      const acc = config.accounts.find(a => a.name === payload.name);
      if (!acc) {
        console.log(JSON.stringify({
          success: false,
          error: "not_found",
          message: `Account '${payload.name}' nicht gefunden`
        }, null, 2));
        return;
      }
      acc.active = !acc.active;
      saveConfig(config);
      console.log(JSON.stringify({
        success: true,
        message: `Account '${payload.name}' ist jetzt ${acc.active ? "aktiv" : "inaktiv"}`
      }, null, 2));
      break;

    default:
      console.log(JSON.stringify({
        success: false,
        error: "invalid_action",
        message: `Unbekannte Aktion: ${action}`,
        available_actions: ["add", "remove", "list", "status", "rotate", "set", "strategy", "toggle"]
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
