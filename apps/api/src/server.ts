import { app } from "./app.js";
import { env } from "./config.js";
import { prisma } from "./db.js";

const server = app.listen(env.PORT, () => {
  console.info(`CloudPilot API listening on port ${env.PORT}`);
});

async function shutdown(signal: string) {
  console.info(`Received ${signal}; shutting down.`);
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
