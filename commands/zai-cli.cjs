#!/usr/bin/env node

/**
 * Z.ai CLI Command
 *
 * Z.ai (GLM-4.7) provider for Claude Code Multi-Provider system.
 * Uses Anthropic-compatible API with Z.ai base URL.
 *
 * Usage: /zai-cli {"prompt": "...", "model": "claude-3-5-sonnet-20241022"}
 *
 * Models available via Z.ai:
 * - claude-3-5-sonnet-20241022 → GLM-4.7 (default)
 * - claude-3-5-haiku-20241022 → GLM-4.5-Air
 * - claude-3-opus-20240229 → GLM-4.7
 */

const https = require("https");

// Z.ai API Configuration
const ZAI_BASE_URL = "api.z.ai";
const ZAI_API_PATH = "/api/anthropic/v1/messages";
const STATE_FILE = `${process.env.HOME || "/tmp"}/.claude-zai-cli-state.json`;

// Circuit Breaker Settings
const CIRCUIT_BREAKER_THRESHOLD = 3;
const CIRCUIT_BREAKER_WINDOW = 5 * 60 * 1000; // 5 minutes
const CIRCUIT_BREAKER_COOLDOWN = 10 * 60 * 1000; // 10 minutes

// Default Model Mapping
const DEFAULT_MODEL = "claude-3-5-sonnet-20241022"; // Maps to GLM-4.7

// Circuit Breaker State Management
function loadState() {
  try {
    const fs = require("fs");
    if (fs.existsSync(STATE_FILE)) {
      return JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
    }
  } catch (err) {
    // Ignore errors
  }
  return { failures: [], lastSuccess: Date.now() };
}

function saveState(state) {
  try {
    const fs = require("fs");
    fs.writeFileSync(STATE_FILE, JSON.stringify(state), "utf8");
  } catch (err) {
    // Ignore write errors
  }
}

function isCircuitBreakerOpen() {
  const state = loadState();
  const now = Date.now();

  // Remove old failures outside window
  state.failures = state.failures.filter(ts => now - ts < CIRCUIT_BREAKER_WINDOW);

  if (state.failures.length >= CIRCUIT_BREAKER_THRESHOLD) {
    const oldestFailure = Math.min(...state.failures);
    const timeSinceOldest = now - oldestFailure;

    if (timeSinceOldest < CIRCUIT_BREAKER_COOLDOWN) {
      const remainingCooldown = Math.ceil((CIRCUIT_BREAKER_COOLDOWN - timeSinceOldest) / 60000);
      return { open: true, remainingMinutes: remainingCooldown };
    }

    // Cooldown expired, reset
    state.failures = [];
    saveState(state);
  }

  return { open: false };
}

function recordFailure() {
  const state = loadState();
  state.failures.push(Date.now());
  saveState(state);
}

function recordSuccess() {
  const state = loadState();
  state.failures = [];
  state.lastSuccess = Date.now();
  saveState(state);
}

// Get API Key from multiple sources (priority order)
function getApiKey() {
  const fs = require("fs");
  const path = require("path");

  // 1. Check ~/.zai_api_key file (dedicated Z.ai key storage)
  try {
    const keyPath = path.join(process.env.HOME || "", ".zai_api_key");
    if (fs.existsSync(keyPath)) {
      const key = fs.readFileSync(keyPath, "utf8").trim();
      if (key) return key;
    }
  } catch (err) {
    // Ignore
  }

  // 2. Check environment variable ZAI_API_KEY
  if (process.env.ZAI_API_KEY) {
    return process.env.ZAI_API_KEY;
  }

  // 3. Check ANTHROPIC_AUTH_TOKEN if it's NOT an Anthropic key
  const envToken = process.env.ANTHROPIC_AUTH_TOKEN;
  if (envToken && !envToken.startsWith("sk-ant-")) {
    return envToken;
  }

  // 4. Try to read from Claude settings (if configured for Z.ai)
  try {
    const settingsPath = path.join(process.env.HOME || "", ".claude", "settings.json");
    if (fs.existsSync(settingsPath)) {
      const settings = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
      const baseUrl = settings.env?.ANTHROPIC_BASE_URL || "";
      if (baseUrl.includes("z.ai") && settings.env?.ANTHROPIC_AUTH_TOKEN) {
        return settings.env.ANTHROPIC_AUTH_TOKEN;
      }
    }
  } catch (err) {
    // Ignore
  }

  return null;
}

// Make HTTPS request to Z.ai API
function makeRequest(prompt, model, apiKey) {
  return new Promise((resolve) => {
    const circuitState = isCircuitBreakerOpen();
    if (circuitState.open) {
      return resolve({
        ok: false,
        type: "circuit_breaker",
        message: `Circuit breaker is open due to repeated failures. Please wait ${circuitState.remainingMinutes} minutes before retrying.`
      });
    }

    if (!apiKey) {
      return resolve({
        ok: false,
        type: "auth",
        message: "Z.ai API key not found. Please configure it:\n" +
          "  1. Get key from: https://z.ai/manage-apikey/apikey-list\n" +
          "  2. Save to ~/.zai_api_key: echo 'your_key' > ~/.zai_api_key\n" +
          "  3. Or set: export ZAI_API_KEY=your_key"
      });
    }

    const requestBody = JSON.stringify({
      model: model || DEFAULT_MODEL,
      max_tokens: 8192,
      messages: [
        {
          role: "user",
          content: prompt
        }
      ]
    });

    const options = {
      hostname: ZAI_BASE_URL,
      port: 443,
      path: ZAI_API_PATH,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "Content-Length": Buffer.byteLength(requestBody)
      },
      timeout: 120000 // 2 minutes
    };

    const req = https.request(options, (res) => {
      let data = "";

      res.on("data", (chunk) => {
        data += chunk;
      });

      res.on("end", () => {
        if (res.statusCode === 200 || res.statusCode === 201) {
          try {
            const response = JSON.parse(data);
            const content = response.content
              ?.filter(block => block.type === "text")
              .map(block => block.text)
              .join("\n") || data;

            recordSuccess();
            resolve({ ok: true, output: content });
          } catch (err) {
            resolve({
              ok: false,
              type: "error",
              message: "Failed to parse Z.ai response: " + err.message
            });
          }
        } else if (res.statusCode === 401) {
          resolve({
            ok: false,
            type: "auth",
            message: "Z.ai authentication failed. Check your API key."
          });
        } else if (res.statusCode === 429) {
          recordFailure();
          resolve({
            ok: false,
            type: "limit",
            message: "Z.ai rate limit reached. Please wait before retrying."
          });
        } else if (res.statusCode >= 500) {
          recordFailure();
          resolve({
            ok: false,
            type: "server_error",
            message: `Z.ai server error: HTTP ${res.statusCode}. Service may be temporarily unavailable.`
          });
        } else {
          recordFailure();
          resolve({
            ok: false,
            type: "error",
            message: `Z.ai API error: HTTP ${res.statusCode}. Response: ${data.substring(0, 500)}`
          });
        }
      });
    });

    req.on("error", (err) => {
      recordFailure();
      resolve({
        ok: false,
        type: "error",
        message: `Z.ai connection error: ${err.message}`
      });
    });

    req.on("timeout", () => {
      req.destroy();
      recordFailure();
      resolve({
        ok: false,
        type: "timeout",
        message: "Z.ai API request timed out after 2 minutes."
      });
    });

    req.write(requestBody);
    req.end();
  });
}

async function main() {
  const inputChunks = [];
  const MAX_INPUT_SIZE = 10 * 1024 * 1024; // 10MB limit
  let totalSize = 0;

  for await (const chunk of process.stdin) {
    totalSize += chunk.length;
    if (totalSize > MAX_INPUT_SIZE) {
      console.error("Input too large (>10MB)");
      process.exit(1);
    }
    inputChunks.push(chunk);
  }

  let payload;
  try {
    payload = JSON.parse(Buffer.concat(inputChunks).toString("utf8") || "{}");
  } catch (err) {
    console.error("Failed to parse JSON input:", err.message);
    process.exit(1);
  }

  const { prompt, model } = payload;

  if (!prompt || typeof prompt !== "string") {
    console.error("Missing required field `prompt` (string).");
    process.exit(1);
  }

  const apiKey = getApiKey();
  const result = await makeRequest(prompt, model, apiKey);

  if (!result.ok) {
    const response = {
      provider: "zai",
      success: false,
      error_type: result.type,
      retryable: result.type === "timeout" || result.type === "server_error",
      message: result.message
    };
    process.stdout.write(JSON.stringify(response, null, 2));
    process.exit(1);
  }

  const response = {
    provider: "zai",
    model: model || DEFAULT_MODEL,
    glm_model: model?.includes("haiku") ? "GLM-4.5-Air" : "GLM-4.7",
    success: true,
    output: result.output
  };

  process.stdout.write(JSON.stringify(response, null, 2));
}

main().catch((err) => {
  console.error("Unexpected error in zai-cli command:", err);
  process.exit(1);
});
