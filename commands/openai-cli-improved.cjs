#!/usr/bin/env node

const { execFile } = require("node:child_process");
const fs = require("fs");
const path = require("path");

// Circuit Breaker State File
const STATE_FILE = path.join(process.env.HOME || "/tmp", ".claude-openai-cli-state.json");
const CIRCUIT_BREAKER_THRESHOLD = 3; // Nach 3 Fehlern innerhalb von 5 Minuten
const CIRCUIT_BREAKER_WINDOW = 5 * 60 * 1000; // 5 Minuten
const CIRCUIT_BREAKER_COOLDOWN = 10 * 60 * 1000; // 10 Minuten Pause

// Load circuit breaker state
function loadState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      const data = fs.readFileSync(STATE_FILE, "utf8");
      return JSON.parse(data);
    }
  } catch (err) {
    // Ignore errors, start fresh
  }
  return { failures: [], lastSuccess: Date.now() };
}

// Save circuit breaker state
function saveState(state) {
  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify(state), "utf8");
  } catch (err) {
    // Ignore write errors
  }
}

// Check if circuit breaker is open (too many recent failures)
function isCircuitBreakerOpen() {
  const state = loadState();
  const now = Date.now();

  // Remove old failures outside the window
  state.failures = state.failures.filter(ts => now - ts < CIRCUIT_BREAKER_WINDOW);

  // Check if we have too many failures
  if (state.failures.length >= CIRCUIT_BREAKER_THRESHOLD) {
    const oldestFailure = Math.min(...state.failures);
    const timeSinceOldest = now - oldestFailure;

    // If oldest failure is within cooldown period, circuit is open
    if (timeSinceOldest < CIRCUIT_BREAKER_COOLDOWN) {
      const remainingCooldown = Math.ceil((CIRCUIT_BREAKER_COOLDOWN - timeSinceOldest) / 60000);
      return {
        open: true,
        remainingMinutes: remainingCooldown
      };
    }

    // Cooldown expired, reset
    state.failures = [];
    saveState(state);
  }

  return { open: false };
}

// Record a failure
function recordFailure() {
  const state = loadState();
  state.failures.push(Date.now());
  saveState(state);
}

// Record a success (resets circuit breaker)
function recordSuccess() {
  const state = loadState();
  state.failures = [];
  state.lastSuccess = Date.now();
  saveState(state);
}

function isRateLimitError(stderr) {
  const msg = stderr.toLowerCase();
  return (
    msg.includes("rate limit") ||
    msg.includes("quota") ||
    msg.includes("billing hard limit") ||
    msg.includes("insufficient_quota") ||
    msg.includes("too many requests")
  );
}

function isAuthError(stderr) {
  const msg = stderr.toLowerCase();
  return (
    msg.includes("not logged in") ||
    (msg.includes("please run") && msg.includes("codex login")) ||
    msg.includes("authentication") ||
    msg.includes("unauthorized") ||
    msg.includes("invalid credentials")
  );
}

function isServerError(stderr) {
  const msg = stderr.toLowerCase();
  return (
    msg.includes("500") ||
    msg.includes("502") ||
    msg.includes("503") ||
    msg.includes("504") ||
    msg.includes("internal server error") ||
    msg.includes("service unavailable") ||
    msg.includes("gateway timeout")
  );
}

function runCodex(prompt, model, sandbox, approvalPolicy) {
  // Check circuit breaker BEFORE making request
  const circuitState = isCircuitBreakerOpen();
  if (circuitState.open) {
    return Promise.resolve({
      ok: false,
      type: "circuit_breaker",
      message: `Circuit breaker is open due to repeated failures. Please wait ${circuitState.remainingMinutes} minutes before retrying. This prevents overwhelming the API during outages.`
    });
  }

  return new Promise((resolve) => {
    const args = [];

    if (sandbox && typeof sandbox === "string") {
      args.push("--sandbox", sandbox);
    }
    if (approvalPolicy && typeof approvalPolicy === "string") {
      args.push("--ask-for-approval", approvalPolicy);
    }

    if (model) {
      args.push("-m", model);
    }
    args.push("exec", prompt);

    const child = execFile("codex", args, {
      maxBuffer: 1024 * 1024,
      timeout: 300000  // 5 minutes timeout
    }, (error, stdout, stderr) => {
      if (error) {
        const stderrText = stderr.toString();

        // Rate limit - record failure
        if (isRateLimitError(stderrText)) {
          recordFailure();
          resolve({
            ok: false,
            type: "limit",
            retryable: false,
            message: "Codex/OpenAI rate limit reached. DO NOT RETRY automatically. Wait before manual retry."
          });
        }
        // Auth error - DON'T record as failure (user needs to login)
        else if (isAuthError(stderrText)) {
          resolve({
            ok: false,
            type: "auth",
            retryable: false,
            message: "Codex CLI authentication missing or invalid. Run `codex login` in your shell."
          });
        }
        // Server error - record failure and suggest circuit breaker
        else if (isServerError(stderrText)) {
          recordFailure();
          resolve({
            ok: false,
            type: "server_error",
            retryable: false,
            message: "OpenAI API server error detected. DO NOT RETRY - likely service outage. Circuit breaker will activate after multiple failures."
          });
        }
        // Timeout error
        else if (error.code === "ETIMEDOUT" || error.killed) {
          recordFailure();
          resolve({
            ok: false,
            type: "timeout",
            retryable: false,
            message: "Request timed out after 5 minutes. DO NOT RETRY automatically."
          });
        }
        // CLI not found
        else if (error.code === "ENOENT") {
          resolve({
            ok: false,
            type: "missing",
            retryable: false,
            message: "The `codex` CLI is not available on PATH. Install with: npm install -g @openai/codex"
          });
        }
        // Other errors - record failure
        else {
          recordFailure();
          resolve({
            ok: false,
            type: "error",
            retryable: false,
            message: "Codex CLI error. DO NOT RETRY. Stderr:\n" + stderrText.trim()
          });
        }
      } else {
        // Success! Reset circuit breaker
        recordSuccess();
        resolve({
          ok: true,
          output: stdout.toString().trim()
        });
      }
    });

    child.on("error", (err) => {
      if (err.code === "ENOENT") {
        resolve({
          ok: false,
          type: "missing",
          retryable: false,
          message: "The `codex` CLI is not available on PATH."
        });
      }
    });
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
    console.error("Failed to parse JSON input from Claude Code:", err.message);
    process.exit(1);
  }

  const prompt = payload.prompt;
  const model = payload.model;
  const sandbox = payload.sandbox;
  const approvalPolicy = payload.approval_policy;

  if (!prompt || typeof prompt !== "string") {
    console.error("Missing required field `prompt` (string).");
    process.exit(1);
  }

  const result = await runCodex(prompt, model, sandbox, approvalPolicy);

  if (!result.ok) {
    const response = {
      provider: "codex",
      success: false,
      error_type: result.type,
      retryable: result.retryable || false,
      message: result.message
    };
    process.stdout.write(JSON.stringify(response, null, 2));
    process.exit(1);
  }

  const response = {
    provider: "codex",
    success: true,
    output: result.output
  };

  process.stdout.write(JSON.stringify(response, null, 2));
}

main().catch((err) => {
  console.error("Unexpected error in openai-cli command:", err);
  process.exit(1);
});
