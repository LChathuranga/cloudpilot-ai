# CloudPilot AI — Frontend MVP Checklist

> **Scope note:** This is the legacy frontend-prototype checklist, not the full product roadmap. The authoritative proposed product plan is [Architecture v1.2 Delivery Roadmap](../architecture/v1.2/delivery-roadmap.md). Review and approve that roadmap milestone by milestone before implementation begins.

## Current integration branch

`dev`

## Frontend foundation

- [x] Create a pnpm workspace and React + TypeScript web application.
- [x] Add the first visual workflow canvas using React Flow.
- [x] Define a Zod-validated workflow graph model.
- [x] Add basic graph validation for duplicate IDs, missing endpoints, and self-connections.
- [x] Add safe text-only script import suggestions for common build, test, security, deploy, and health-check commands.
- [ ] Run a clean dependency install, typecheck, and production build in a Node.js environment.

## Workflow editing

- [ ] Confirm and document the supported node catalog and each node's settings.
- [ ] Complete custom node visuals and node-specific configuration.
- [ ] Validate allowed edge types and detect cycles where cycles are unsupported.
- [x] Implement browser-local save/load and workflow snapshots in the prototype; this is not backend/cloud persistence.
- [ ] Add a reviewable diff when a workflow is changed.
- [ ] Replace browser-only authoritative storage with backend persistence in the relevant approved roadmap milestone.

## Script import safety

- [x] Limit accepted file extensions and file size in the prototype.
- [x] Read imported files as text; never execute them.
- [x] Present recognized commands as suggestions, not as trusted workflow definitions.
- [ ] Add explicit warnings for unknown commands, secrets, destructive operations, and shell-specific behavior.
- [ ] Move parsing to a server-side isolated analysis boundary before supporting untrusted public uploads.

## AI workflow planner

- [ ] Define a structured request/response contract for AI-generated workflow proposals.
- [ ] Validate every proposal against the versioned component catalog and graph schema.
- [ ] Require users to review and accept proposed changes.
- [ ] Keep provider credentials and execution permissions out of the AI planning context.

## Mock runner

- [ ] Implement deterministic node-by-node mock execution.
- [ ] Show status, duration, and redacted logs for each node.
- [ ] Enforce graph validation before each run.
- [ ] Clearly distinguish simulation from real execution.

## Future provider integrations

- [ ] Add a provider interface after the mock workflow lifecycle is stable.
- [ ] Bind approvals to a specific workflow version, infrastructure revision, plan digest, target, policy, and expiry.
- [ ] Add a first real cloud slice only after a separate security review.
- [ ] Do not enable real cloud provisioning in the initial prototype.

## Safety invariants

1. Uploaded scripts are untrusted reference material and are never executed automatically.
2. AI may propose typed graph changes; it does not receive arbitrary privileged shell execution.
3. Validate on the server as well as the client.
4. Secrets must not be included in logs, prompts, or workflow diffs.
5. The mock runner must not contact cloud APIs or create infrastructure.
6. A successful mock run must not be presented as a successful real deployment.
