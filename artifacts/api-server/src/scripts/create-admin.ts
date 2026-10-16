import "dotenv/config";
import readline from "node:readline";
import bcrypt from "bcryptjs";
import { connectMongo } from "../lib/mongo";
import { AdminUserModel } from "../models/admin";
import { logger } from "../lib/logger";

function ask(label: string): Promise<string> {
  return new Promise((resolve) => {
    const terminal = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    terminal.question(label, (answer) => {
      terminal.close();
      resolve(answer.trim());
    });
  });
}

function askHidden(label: string): Promise<string> {
  const input = process.stdin;
  if (!input.isTTY || typeof input.setRawMode !== "function") {
    throw new Error("Run admin:create from an interactive terminal to hide the password.");
  }
  process.stdout.write(label);
  input.setRawMode(true);
  input.resume();
  return new Promise((resolve, reject) => {
    let value = "";
    const onData = (buffer: Buffer) => {
      for (const character of buffer.toString("utf8")) {
        if (character === "\u0003") {
          input.setRawMode(false);
          input.pause();
          input.off("data", onData);
          process.stdout.write("\n");
          reject(new Error("Admin setup cancelled."));
          return;
        }
        if (character === "\r" || character === "\n") {
          input.setRawMode(false);
          input.pause();
          input.off("data", onData);
          process.stdout.write("\n");
          resolve(value);
          return;
        }
        if (character === "\u007f" || character === "\b") {
          value = value.slice(0, -1);
          continue;
        }
        if (character >= " ") {
          value += character;
          process.stdout.write("*");
        }
      }
    };
    input.on("data", onData);
  });
}

async function createAdmin(): Promise<void> {
  await connectMongo();
  const email = (await ask("Administrator email: ")).toLowerCase();
  const displayName = await ask("Display name: ");
  const password = await askHidden("Password (minimum 12 characters): ");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("Enter a valid administrator email.");
  }
  if (password.length < 12) {
    throw new Error("Administrator password must be at least 12 characters.");
  }
  if (displayName.length < 2 || displayName.length > 120) {
    throw new Error("Display name must be between 2 and 120 characters.");
  }
  const passwordHash = await bcrypt.hash(password, 12);
  await AdminUserModel.create({
    email,
    displayName,
    passwordHash,
    role: "admin",
    active: true,
  });
  logger.info({ email }, "Administrator account created");
}

createAdmin()
  .catch((error: unknown) => {
    logger.error(
      { errorName: error instanceof Error ? error.name : "UnknownError" },
      "Could not create administrator",
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    const mongoose = await import("mongoose");
    await mongoose.default.disconnect();
  });
