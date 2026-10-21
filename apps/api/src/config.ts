import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  DATABASE_URL: z.string().min(1),
  CORS_ORIGIN: z.string().default("http://localhost:5173"),
  AUTH_MODE: z.enum(["development", "jwt"]).default("development"),
  JWT_SECRET: z.string().min(32).optional()
});

export const env = envSchema.parse(process.env);

if (env.NODE_ENV === "production" && env.AUTH_MODE !== "jwt") {
  throw new Error("AUTH_MODE=jwt is required in production.");
}
if (env.AUTH_MODE === "jwt" && (!env.JWT_SECRET || env.JWT_SECRET.length < 32)) {
  throw new Error("JWT_SECRET must contain at least 32 characters when AUTH_MODE=jwt.");
}
