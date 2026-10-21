import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const apiEnvPath = process.env.DOTENV_CONFIG_PATH
  ? path.resolve(root, process.env.DOTENV_CONFIG_PATH)
  : path.join(root, "artifacts", "api-server", ".env.local");

if (!existsSync(apiEnvPath)) {
  console.error(
    `API environment file not found: ${apiEnvPath}\n` +
      "Create artifacts/api-server/.env.local from .env.example and add the required values.",
  );
  process.exit(1);
}

const packageManager = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const apiPort = process.env.API_PORT ?? "8080";
const frontendPort = process.env.FRONTEND_PORT ?? "5174";
const devFrontendOrigins = [
  `http://localhost:${frontendPort}`,
  `http://127.0.0.1:${frontendPort}`,
].join(",");
const services = [
  {
    name: "API",
    args: ["--filter", "@workspace/api-server", "run", "dev"],
    env: {
      PORT: apiPort,
      DOTENV_CONFIG_PATH: apiEnvPath,
      DEV_FRONTEND_ORIGINS: devFrontendOrigins,
    },
  },
  {
    name: "Frontend",
    args: ["--filter", "@workspace/pulp-doctor", "run", "dev"],
    env: {
      PORT: frontendPort,
      API_PROXY_TARGET:
        process.env.API_PROXY_TARGET ?? `http://127.0.0.1:${apiPort}`,
    },
  },
];

let stopping = false;
const children = [];

function stopChildren(signal = "SIGTERM") {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    if (child.exitCode === null && !child.killed) child.kill(signal);
  }
}

process.on("SIGINT", () => stopChildren("SIGINT"));
process.on("SIGTERM", () => stopChildren("SIGTERM"));

for (const service of services) {
  const child = spawn(packageManager, service.args, {
    cwd: root,
    env: { ...process.env, ...service.env },
    stdio: "inherit",
  });
  children.push(child);

  child.on("error", (error) => {
    console.error(`${service.name} failed to start: ${error.message}`);
    process.exitCode = 1;
    stopChildren();
  });

  child.on("exit", (code, signal) => {
    if (stopping) return;
    if (code !== 0) {
      console.error(
        `${service.name} stopped${signal ? ` (${signal})` : ` with exit code ${code}`}.`,
      );
    }
    process.exitCode = code ?? 1;
    stopChildren();
  });
}
