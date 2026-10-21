import { Router, type Request } from "express";
import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../db.js";
import { validateWorkflow } from "../workflow/validate.js";
import { workflowGraphSchema } from "../workflow/schema.js";

export const workflowsRouter = Router();

const saveBodySchema = z.object({
  name: z.string().trim().min(1).max(120),
  graph: workflowGraphSchema,
  editorState: z.unknown().optional(),
  expectedVersion: z.number().int().nonnegative().optional()
}).strict();

const idSchema = z.string().min(1).max(128);
const jsonValue = (value: unknown): Prisma.InputJsonValue =>
  JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;

function userId(req: Request): string {
  return req.userId as string;
}

workflowsRouter.get("/", async (req, res, next) => {
  try {
    const workflows = await prisma.workflow.findMany({
      where: { ownerId: userId(req) },
      orderBy: { updatedAt: "desc" },
      select: {
        id: true, name: true, latestVersion: true, createdAt: true, updatedAt: true,
        versions: { orderBy: { version: "desc" }, take: 1, select: { createdAt: true } }
      }
    });
    res.json({ data: workflows });
  } catch (error) { next(error); }
});

workflowsRouter.post("/", async (req, res, next) => {
  try {
    const body = saveBodySchema.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: { code: "REQUEST_INVALID", message: "Workflow payload is invalid.", details: body.error.issues } });
      return;
    }
    const workflowId = randomUUID();
    const graph = { ...body.data.graph, id: workflowId, name: body.data.name, version: 1 };
    const result = validateWorkflow(graph);
    const created = await prisma.workflow.create({
      data: {
        id: workflowId,
        ownerId: userId(req),
        name: body.data.name,
        latestVersion: 1,
        versions: { create: {
          version: 1,
          graph: jsonValue(graph),
          ...(body.data.editorState === undefined ? {} : { editorState: jsonValue(body.data.editorState) }),
          validationErrors: jsonValue(result.issues)
        } },
      },
      include: { versions: { where: { version: 1 } } }
    });
    res.status(201).json({ data: created, validation: { valid: result.valid, issues: result.issues } });
  } catch (error) { next(error); }
});

workflowsRouter.get("/:id", async (req, res, next) => {
  try {
    const id = idSchema.safeParse(req.params.id);
    if (!id.success) { res.status(400).json({ error: { code: "ID_INVALID", message: "Workflow ID is invalid." } }); return; }
    const version = req.query.version === undefined ? undefined : Number(req.query.version);
    if (version !== undefined && (!Number.isInteger(version) || version < 1)) {
      res.status(400).json({ error: { code: "VERSION_INVALID", message: "Version must be a positive integer." } }); return;
    }
    const workflow = await prisma.workflow.findFirst({
      where: { id: id.data, ownerId: userId(req) }
    });
    if (!workflow) { res.status(404).json({ error: { code: "WORKFLOW_NOT_FOUND", message: "Workflow was not found." } }); return; }
    const selected = version
      ? await prisma.workflowVersion.findFirst({ where: { workflowId: workflow.id, version } })
      : await prisma.workflowVersion.findFirst({ where: { workflowId: workflow.id }, orderBy: { version: "desc" } });
    if (!selected) { res.status(404).json({ error: { code: "VERSION_NOT_FOUND", message: "Workflow version was not found." } }); return; }
    res.json({ data: { id: workflow.id, name: workflow.name, latestVersion: workflow.latestVersion, createdAt: workflow.createdAt, updatedAt: workflow.updatedAt, version: selected } });
  } catch (error) { next(error); }
});

workflowsRouter.put("/:id", async (req, res, next) => {
  try {
    const id = idSchema.safeParse(req.params.id);
    const body = saveBodySchema.safeParse(req.body);
    if (!id.success || !body.success) {
      res.status(400).json({ error: { code: "REQUEST_INVALID", message: "Workflow ID or payload is invalid.", details: body.success ? undefined : body.error.issues } });
      return;
    }
    if (body.data.expectedVersion === undefined) {
      res.status(428).json({ error: { code: "EXPECTED_VERSION_REQUIRED", message: "Supply expectedVersion to prevent accidental version overwrites." } });
      return;
    }
    const current = await prisma.workflow.findFirst({ where: { id: id.data, ownerId: userId(req) } });
    if (!current) { res.status(404).json({ error: { code: "WORKFLOW_NOT_FOUND", message: "Workflow was not found." } }); return; }
    if (current.latestVersion !== body.data.expectedVersion) {
      res.status(409).json({ error: { code: "VERSION_CONFLICT", message: "Workflow changed since it was opened.", latestVersion: current.latestVersion } });
      return;
    }
    const nextVersion = current.latestVersion + 1;
    const graph = { ...body.data.graph, id: current.id, name: body.data.name, version: nextVersion };
    const validation = validateWorkflow(graph);
    const saved = await prisma.$transaction(async (tx) => {
      const update = await tx.workflow.updateMany({
        where: { id: current.id, ownerId: userId(req), latestVersion: body.data.expectedVersion },
        data: { name: body.data.name, latestVersion: nextVersion }
      });
      if (update.count !== 1) throw new VersionConflictError();
      const version = await tx.workflowVersion.create({
        data: {
          workflowId: current.id, version: nextVersion,
          graph: jsonValue(graph),
          ...(body.data.editorState === undefined ? {} : { editorState: jsonValue(body.data.editorState) }),
          validationErrors: jsonValue(validation.issues)
        }
      });
      return { workflow: { id: current.id, name: body.data.name, latestVersion: nextVersion }, version };
    });
    res.status(201).json({ data: saved, validation: { valid: validation.valid, issues: validation.issues } });
  } catch (error) { next(error); }
});

workflowsRouter.get("/:id/versions", async (req, res, next) => {
  try {
    const id = idSchema.safeParse(req.params.id);
    if (!id.success) { res.status(400).json({ error: { code: "ID_INVALID", message: "Workflow ID is invalid." } }); return; }
    const workflow = await prisma.workflow.findFirst({ where: { id: id.data, ownerId: userId(req) }, select: { id: true } });
    if (!workflow) { res.status(404).json({ error: { code: "WORKFLOW_NOT_FOUND", message: "Workflow was not found." } }); return; }
    const versions = await prisma.workflowVersion.findMany({
      where: { workflowId: workflow.id }, orderBy: { version: "desc" },
      select: { id: true, version: true, createdAt: true, validationErrors: true }
    });
    res.json({ data: versions });
  } catch (error) { next(error); }
});

workflowsRouter.post("/validate", async (req, res) => {
  const result = validateWorkflow(req.body?.graph ?? req.body);
  res.status(result.valid ? 200 : 422).json({ data: { valid: result.valid, issues: result.issues } });
});

workflowsRouter.post("/:id/mock-runs", async (req, res, next) => {
  try {
    const id = idSchema.safeParse(req.params.id);
    if (!id.success) { res.status(400).json({ error: { code: "ID_INVALID", message: "Workflow ID is invalid." } }); return; }
    const version = req.body?.version === undefined ? undefined : Number(req.body.version);
    if (version !== undefined && (!Number.isInteger(version) || version < 1)) {
      res.status(400).json({ error: { code: "VERSION_INVALID", message: "Version must be a positive integer." } }); return;
    }
    const workflow = await prisma.workflow.findFirst({ where: { id: id.data, ownerId: userId(req) } });
    if (!workflow) { res.status(404).json({ error: { code: "WORKFLOW_NOT_FOUND", message: "Workflow was not found." } }); return; }
    const snapshot = await prisma.workflowVersion.findFirst({
      where: { workflowId: workflow.id, version: version ?? workflow.latestVersion }
    });
    if (!snapshot) { res.status(404).json({ error: { code: "VERSION_NOT_FOUND", message: "Workflow version was not found." } }); return; }
    const validation = validateWorkflow(snapshot.graph);
    if (!validation.valid) {
      res.status(422).json({ error: { code: "WORKFLOW_INVALID", message: "Workflow must pass server-side validation before a mock run.", issues: validation.issues } });
      return;
    }
    // Deliberately does not execute commands, contact cloud APIs, or provision resources.
    res.status(202).json({
      data: { workflowId: workflow.id, version: snapshot.version, status: "accepted", mode: "validation-only-mock" },
      message: "Validation passed. No commands were executed and no infrastructure was changed."
    });
  } catch (error) { next(error); }
});

class VersionConflictError extends Error { constructor() { super("Version conflict"); this.name = "VersionConflictError"; } }
