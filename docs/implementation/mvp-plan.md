# CloudPilot AI — MVP Implementation Plan

## Current branch

`feature/mvp-foundation`

## Milestones

### 1. Foundation — in progress
- [x] Create a pnpm workspace and React + TypeScript web application.
- [x] Add the first visual workflow canvas using React Flow.
- [x] Define a Zod-validated workflow graph model.
- [x] Add basic graph validation for duplicate IDs, missing endpoints, and self-connections.
- [x] Add safe text-only script import suggestions for common build, test, security, deploy, and health-check commands.
- [ ] Run a clean dependency install, typecheck, and production build in a Node.js environment.

### 2. Workflow editing
- [ ] Add a typed custom node component for each supported node type.
- [ ] Support editing node labels and node-specific configuration.
- [ ] Validate allowed edge types and detect cycles where cycles are unsupported.
- [ ] Add local save/load and immutable workflow version snapshots.
- [ ] Add a reviewable diff when a workflow is changed.

### 3. Script import safety
- [x] Limit accepted file extensions and file size in the prototype.
- [x] Read imported files as text; never execute them.
- [x] Present recognized commands as suggestions, not as trusted workflow definitions.
- [ ] Add explicit warnings for unknown commands, secrets, destructive operations, and shell-specific behavior.
- [ ] Move parsing to a server-side isolated analysis boundary before supporting untrusted public uploads.

### 4. AI workflow planner
- [ ] Define a structured request/response contract for AI-generated workflow proposals.
- [ ] Validate every proposal against the node catalog and graph schema.
- [ ] Require users to review and accept proposed changes.
- [ ] Keep provider credentials and execution permissions out of the AI planning context.

### 5. Mock runner
- [ ] Implement deterministic node-by-node mock execution.
- [ ] Show status, duration, and redacted logs for each node.
- [ ] Enforce graph validation before each run.
- [ ] Clearly distinguish simulation from real execution.

### 6. Future provider integrations
- [ ] Add a provider interface after the mock workflow lifecycle is stable.
- [ ] Bind approvals to a specific workflow version, target, environment, policy, and expiry.
- [ ] Add AWS ECS/Fargate only after a separate security review.
- [ ] Do not enable real cloud provisioning in the initial MVP.

## Safety invariants

1. Uploaded scripts are untrusted reference material and are never executed automatically.
2. AI may propose typed graph changes; it does not receive arbitrary privileged shell execution.
3. Validate on the server as well as the client.
4. Secrets must not be included in logs, prompts, or workflow diffs.
5. The mock runner must not contact cloud APIs or create infrastructure.
