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
    (msg.includes("please run") && msg.includes("gemini login")) ||
    msg.includes("authentication") ||
    msg.includes("unauthorized")
  );
}

function runGemini(prompt, model, yolo, approvalMode) {
  return new Promise((resolve) => {
    const args = [];
    if (model) {
      args.push("--model", model);
    }
    // YOLO / approval flags: Gemini CLI erlaubt NICHT --yolo und --approval-mode gleichzeitig
    // Wenn approval_mode gesetzt ist, verwende das (hat Priorität)
    // Wenn nur yolo=true, dann setze --approval-mode=yolo
    // Wenn beides fehlt, nutze Gemini-Standardverhalten
    if (approvalMode && typeof approvalMode === "string") {
      args.push("--approval-mode", approvalMode);
    } else if (yolo === true) {
      args.push("--approval-mode", "yolo");
    }
    // Non-interactive, single prompt invocation.
    args.push(prompt);

    const child = execFile("gemini", args, { maxBuffer: 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        const stderrText = stderr.toString();
        if (isRateLimitError(stderrText)) {
          resolve({
            ok: false,
            type: "limit",
            message:
              "Gemini account usage limit or quota appears to be reached. Please wait or adjust your account limits before retrying."
          });
        } else if (isAuthError(stderrText)) {
          resolve({
            ok: false,
            type: "auth",
            message:
              "Gemini CLI authentication appears to be missing or invalid. Please ensure your Gemini CLI is logged in/configured and then retry."
          });
        } else if (error.code === "ENOENT") {
          resolve({
            ok: false,
            type: "missing",
            message:
              "The `gemini` CLI is not available on PATH. Please install the official Gemini CLI and retry."
          });
        } else {
          resolve({
            ok: false,
            type: "error",
            message:
              "Gemini CLI returned an error. Stderr:\n" +
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
            "The `gemini` CLI is not available on PATH. Please install the official Gemini CLI and retry."
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
  const yolo = payload.yolo;
  const approvalMode = payload.approval_mode;

  if (!prompt || typeof prompt !== "string") {
    console.error("Missing required field `prompt` (string).");
    process.exit(1);
  }

  const result = await runGemini(prompt, model, yolo, approvalMode);

  if (!result.ok) {
    const response = {
      provider: "gemini",
      success: false,
      error_type: result.type,
      message: result.message
    };
    process.stdout.write(JSON.stringify(response, null, 2));
    process.exit(1);
  }

  const response = {
    provider: "gemini",
    success: true,
    output: result.output
  };

  process.stdout.write(JSON.stringify(response, null, 2));
}

main().catch((err) => {
  console.error("Unexpected error in gemini-cli command:", err);
  process.exit(1);
});
