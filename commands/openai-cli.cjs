#!/usr/bin/env node

const { execFile } = require("node:child_process");

function isRateLimitError(stderr) {
  const msg = stderr.toLowerCase();
  return (
    msg.includes("rate limit") ||
    msg.includes("quota") ||
    msg.includes("billing hard limit") ||
    msg.includes("insufficient_quota")
  );
}

function isAuthError(stderr) {
  const msg = stderr.toLowerCase();
  return (
    msg.includes("not logged in") ||
    (msg.includes("please run") && msg.includes("codex login")) ||
    msg.includes("authentication") ||
    msg.includes("unauthorized")
  );
}

function runCodex(prompt, model, sandbox, approvalPolicy) {
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
    // Non-interactive, single-shot execution
    args.push("exec", prompt);

    const child = execFile("codex", args, { maxBuffer: 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        const stderrText = stderr.toString();
        if (isRateLimitError(stderrText)) {
          resolve({
            ok: false,
            type: "limit",
            message:
              "Codex/OpenAI usage limit or quota appears to be reached. Please wait or adjust your account limits before retrying."
          });
        } else if (isAuthError(stderrText)) {
          resolve({
            ok: false,
            type: "auth",
            message:
              "Codex CLI authentication appears to be missing or invalid. Please run `codex login` in your shell and then retry."
          });
        } else if (error.code === "ENOENT") {
          resolve({
            ok: false,
            type: "missing",
            message:
              "The `codex` CLI is not available on PATH. Please install `@openai/codex` globally with npm and retry."
          });
        } else {
          resolve({
            ok: false,
            type: "error",
            message:
              "Codex CLI returned an error. Stderr:\n" +
              stderrText.trim()
          });
        }
      } else {
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
          message:
            "The `codex` CLI is not available on PATH. Please install `@openai/codex` globally with npm and retry."
        });
      }
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
