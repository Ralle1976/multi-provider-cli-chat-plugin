#!/usr/bin/env node

const { execFile } = require("node:child_process");

function isRateLimitError(stderr) {
  const msg = stderr.toLowerCase();
  return (
    msg.includes("rate limit") ||
    msg.includes("quota") ||
    msg.includes("billing") ||
    msg.includes("insufficient_quota") ||
    msg.includes("too many requests")
  );
}

function isAuthError(stderr) {
  const msg = stderr.toLowerCase();
  return (
    msg.includes("not logged in") ||
    msg.includes("api key") ||
    msg.includes("authentication") ||
    msg.includes("unauthorized") ||
    msg.includes("invalid key") ||
    msg.includes("dashscope")
  );
}

function runQwen(prompt, model, yolo, approvalMode) {
  return new Promise((resolve) => {
    const args = [];

    // Model selection (Qwen3-Coder variants)
    if (model) {
      args.push("--model", model);
    }

    // YOLO / approval mode (Qwen-Code CLI is fork of Gemini CLI)
    if (approvalMode && typeof approvalMode === "string") {
      args.push("--approval-mode", approvalMode);
    } else if (yolo === true) {
      args.push("--approval-mode", "yolo");
    }

    // Non-interactive, single prompt invocation
    args.push(prompt);

    const child = execFile("qwen", args, { maxBuffer: 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        const stderrText = stderr.toString();
        if (isRateLimitError(stderrText)) {
          resolve({
            ok: false,
            type: "limit",
            message:
              "Qwen account usage limit or quota reached. You have daily free limits - please wait until reset or use a different model."
          });
        } else if (isAuthError(stderrText)) {
          resolve({
            ok: false,
            type: "auth",
            message:
              "Qwen CLI authentication missing or invalid. Please configure your DashScope API key:\n" +
              "  export OPENAI_API_KEY='your_dashscope_key'\n" +
              "  export OPENAI_BASE_URL='https://dashscope-intl.aliyuncs.com/compatible-mode/v1'"
          });
        } else if (error.code === "ENOENT") {
          resolve({
            ok: false,
            type: "missing",
            message:
              "The `qwen` CLI is not available on PATH. Install with:\n" +
              "  npm install -g @qwen-code/qwen-code"
          });
        } else {
          resolve({
            ok: false,
            type: "error",
            message:
              "Qwen CLI returned an error. Stderr:\n" +
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
  });
}

async function main() {
  // Read JSON from stdin
  let inputData = "";
  process.stdin.setEncoding("utf8");
  for await (const chunk of process.stdin) {
    inputData += chunk;
  }

  let params;
  try {
    params = JSON.parse(inputData.trim());
  } catch {
    console.log(
      JSON.stringify({
        provider: "qwen",
        success: false,
        error_type: "error",
        message: "Invalid JSON input. Expected: {\"prompt\": \"...\", \"model\": \"...\"}"
      })
    );
    process.exit(0);
  }

  const { prompt, model, yolo, approval_mode } = params;

  if (!prompt) {
    console.log(
      JSON.stringify({
        provider: "qwen",
        success: false,
        error_type: "error",
        message: "Missing required 'prompt' field in JSON input."
      })
    );
    process.exit(0);
  }

  const result = await runQwen(prompt, model, yolo, approval_mode);

  if (result.ok) {
    console.log(
      JSON.stringify({
        provider: "qwen",
        success: true,
        output: result.output
      })
    );
  } else {
    console.log(
      JSON.stringify({
        provider: "qwen",
        success: false,
        error_type: result.type,
        message: result.message
      })
    );
  }
}

main();
