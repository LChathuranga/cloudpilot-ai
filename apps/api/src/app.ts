import express, { type ErrorRequestHandler } from "express";
import cors from "cors";
import helmet from "helmet";
import { env } from "./config.js";
import { requireUser } from "./auth.js";
import { workflowsRouter } from "./routes/workflows.js";

export const app = express();
app.disable("x-powered-by");
app.use(helmet());
app.use(cors({ origin: env.CORS_ORIGIN.split(",").map((origin) => origin.trim()), credentials: false }));
app.use(express.json({ limit: "1mb", strict: true }));

app.get("/health", (_req, res) => res.json({ status: "ok", service: "cloudpilot-api" }));
app.use("/api/workflows", requireUser, workflowsRouter);

app.use((_req, res) => res.status(404).json({ error: { code: "NOT_FOUND", message: "Route not found." } }));

const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  if (error instanceof SyntaxError && "body" in error) {
    res.status(400).json({ error: { code: "JSON_INVALID", message: "Request body must be valid JSON." } });
    return;
  }
  if (error instanceof Error && error.name === "VersionConflictError") {
    res.status(409).json({ error: { code: "VERSION_CONFLICT", message: "Workflow changed while saving. Reload and retry." } });
    return;
  }
  // Do not expose database or internal error details to clients.
  console.error("Unhandled API error:", error);
  res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "An unexpected server error occurred." } });
};
app.use(errorHandler);
