import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { env } from "./config.js";

declare global {
  namespace Express {
    interface Request { userId?: string }
  }
}

export function requireUser(req: Request, res: Response, next: NextFunction): void {
  if (env.AUTH_MODE === "development" && env.NODE_ENV !== "production") {
    const userId = req.header("x-user-id")?.trim() || "local-development-user";
    if (userId.length > 128) {
      res.status(400).json({ error: { code: "INVALID_USER_ID", message: "x-user-id is too long." } });
      return;
    }
    req.userId = userId;
    next();
    return;
  }

  const authorization = req.header("authorization");
  if (!authorization?.startsWith("Bearer ")) {
    res.status(401).json({ error: { code: "AUTH_REQUIRED", message: "A valid Bearer token is required." } });
    return;
  }

  try {
    const claims = jwt.verify(authorization.slice(7), env.JWT_SECRET!, {
      algorithms: ["HS256"],
      issuer: "cloudpilot-ai",
      audience: "cloudpilot-api"
    });
    if (typeof claims === "string" || typeof claims.sub !== "string" || !claims.sub.trim()) {
      res.status(401).json({ error: { code: "INVALID_TOKEN", message: "Token subject is missing." } });
      return;
    }
    req.userId = claims.sub;
    next();
  } catch {
    res.status(401).json({ error: { code: "INVALID_TOKEN", message: "Bearer token is invalid or expired." } });
  }
}
