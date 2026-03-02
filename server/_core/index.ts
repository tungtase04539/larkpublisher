import dotenv from "dotenv";
import fs from "fs";
import path from "node:path";
import readline from "node:readline";

function getEnvPath(): string {
  if ((process as any).pkg) {
    return path.resolve(path.dirname(process.execPath), ".env");
  }
  return path.resolve(process.cwd(), ".env");
}

function askQuestion(rl: readline.Interface, question: string): Promise<string> {
  return new Promise((resolve) => rl.question(question, resolve));
}

async function ensureEnv(): Promise<void> {
  const envPath = getEnvPath();
  dotenv.config({ path: envPath });

  // Check if required env vars exist
  if (process.env.LARK_APP_ID && process.env.LARK_APP_SECRET) return;

  console.log("\n╔══════════════════════════════════════════╗");
  console.log("║   Lark Wiki Publisher - Cài đặt ban đầu  ║");
  console.log("╚══════════════════════════════════════════╝\n");

  if (!fs.existsSync(envPath)) {
    console.log(`Không tìm thấy file .env tại: ${envPath}`);
  } else {
    console.log("File .env thiếu thông tin cấu hình.");
  }

  console.log("Vui lòng nhập thông tin Lark App:\n");

  const rl = readline.createInterface({input: process.stdin, output: process.stdout});
  const appId = process.env.LARK_APP_ID || await askQuestion(rl, "  LARK_APP_ID: ");
  const appSecret = process.env.LARK_APP_SECRET || await askQuestion(rl, "  LARK_APP_SECRET: ");
  rl.close();

  const envContent = `LARK_APP_ID=${appId.trim()}\nLARK_APP_SECRET=${appSecret.trim()}\n`;
  fs.writeFileSync(envPath, envContent, "utf-8");
  console.log(`\n✅ Đã lưu cấu hình vào ${envPath}\n`);

  // Reload
  dotenv.config({ path: envPath, override: true });
}

import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  // Ensure .env is configured before starting
  await ensureEnv();

  const app = express();
  const server = createServer(app);
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  // OAuth callback under /api/oauth/callback
  registerOAuthRoutes(app);
  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    const url = `http://localhost:${port}/`;
    console.log(`Server running on ${url}`);
    // Auto-open browser
    import("child_process").then(({ exec }) => {
      exec(`start ${url}`);
    });
  });
}

startServer().catch(async (err) => {
  console.error("\n❌ Lỗi khởi động server:", err.message || err);
  console.error(err.stack || "");
  // Keep cmd window open so user can read the error
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  await new Promise<void>((resolve) => rl.question("\nNhấn Enter để thoát...", () => { rl.close(); resolve(); }));
  process.exit(1);
});
