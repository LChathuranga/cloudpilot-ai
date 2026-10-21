# CloudPilot AI API (Express)

Express + TypeScript API for server-side workflow validation and PostgreSQL persistence.

## Requirements

- Node.js 20+
- pnpm 10+
- PostgreSQL 14+
- The repository root workspace

## Local setup

1. From the repository root, run `pnpm install`.
2. Copy `apps/api/.env.example` to `apps/api/.env` and set `DATABASE_URL`.
3. Start PostgreSQL and create the database/user configured in `DATABASE_URL`.
4. Generate the Prisma client and apply the initial migration:

   ```sh
   pnpm --filter @cloudpilot/api prisma:generate
   pnpm --filter @cloudpilot/api exec prisma migrate dev --name init
   ```

5. Start the API:

   ```sh
   pnpm --filter @cloudpilot/api dev
   ```

Health check: `GET http://localhost:4000/health`.

## Authentication warning

For local development only, `AUTH_MODE=development` accepts an optional `x-user-id` header (defaults to `local-development-user`). This is **not authentication** and must never be exposed on a public network. Production refuses to start unless `AUTH_MODE=jwt`; JWTs must be signed with HS256 and include issuer `cloudpilot-ai`, audience `cloudpilot-api`, and a user ID in `sub`. Token issuance/identity-provider integration is intentionally not implemented in this MVP.

## API endpoints

All `/api/workflows` routes require the configured auth mode.

- `GET /api/workflows` — list workflows owned by the current user.
- `POST /api/workflows` — create a workflow and version 1. Invalid drafts may be saved; response includes validation results.
- `GET /api/workflows/:id` — fetch latest version; use `?version=2` for a specific version.
- `PUT /api/workflows/:id` — create a new immutable version. Requires `expectedVersion`; returns 409 on concurrent changes.
- `GET /api/workflows/:id/versions` — list version metadata.
- `POST /api/workflows/validate` — validate a graph without saving. Returns 422 for invalid graphs.
- `POST /api/workflows/:id/mock-runs` — server-validates a saved version. This endpoint does not execute scripts or deploy resources.

### Graph payload

The canonical API graph uses flattened node data, compatible with the workflow domain schema in the frontend:

```json
{
  "id": "client-workflow-id",
  "name": "My deployment workflow",
  "version": 1,
  "nodes": [
    { "id": "trigger-1", "type": "trigger", "label": "Trigger", "config": { "event": "manual", "branch": "main" } },
    { "id": "build-1", "type": "build", "label": "Build", "config": { "command": "npm run build" } }
  ],
  "edges": [{ "id": "edge-1", "source": "trigger-1", "target": "build-1" }]
}
```

Save endpoints also accept optional `editorState` JSON for React Flow positions and UI-specific metadata. Store secrets in a dedicated secret manager in a later phase; do not put credentials in node config.

## Important limitations

- Workflow ownership is enforced at the database query layer, but production identity/token issuance must be integrated before public deployment.
- The mock-run endpoint is validation-only and does not execute commands.
- The graph schema is currently mirrored in the API and frontend. Extracting it into a shared package is a follow-up to avoid drift.
- No build, migration, or live API test has been run in this change yet.
