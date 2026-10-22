# Delivery Roadmap — One Milestone at a Time

**Status:** Architecture v1.2 approved by the project owner on 2026-10-22; Milestone 1 implementation is in progress on a feature branch.  
**Working rule:** Review and agree on each milestone, implement only that milestone, test it, review its PR into `dev`, then begin the next one.

## Milestone 0 — Architecture review (approved)

Deliverables:
- [x] Record product direction: CI/CD + infrastructure design/provisioning.
- [x] Define two distinct canvases.
- [x] Select visual-first infrastructure model with Terraform/OpenTofu generation.
- [x] Define component families and typed contracts at design level.
- [x] Define workflow semantics, backend boundaries and branch flow.
- [x] Review the full design pack with the project owner.
- [x] Resolve open questions and mark design version approved.

Acceptance: design docs reflect an explicit decision; no backend/provider code is added as part of this milestone.

## Milestone 1 — Component contract and graph core (in progress)

Scope:
- Finalize TypeScript/Zod component definition contracts.
- Define workflow graph and infrastructure graph types separately.
- Define edge types, typed ports, resource references and stable IDs.
- Add unit tests for valid/invalid graphs and schema versions.
- Add a small sample catalog; do not build dozens of provider nodes yet.

Acceptance:
- Typecheck/build/tests pass.
- Invalid edges/configuration are rejected with actionable errors.
- Workflow and infrastructure edge semantics are distinct.
- Existing frontend behavior is not broken.

## Milestone 2 — UI foundation for two canvases

Scope:
- Add workspace tabs for Infrastructure and Workflows.
- Preserve the current workflow editor.
- Add infrastructure canvas with a small design-only resource catalog.
- Add catalog-driven property panels for a narrow set of components.
- Save canvas position separately from graph semantics.

Acceptance:
- Users can create/edit both graph types.
- Moving nodes never changes infrastructure meaning or workflow order.
- Incompatible edges are blocked or explained.
- No real provisioning is possible.

## Milestone 3 — Local/backend persistence and revisions

Scope:
- Agree backend package structure and authentication strategy.
- Add Express API and PostgreSQL.
- Persist projects, designs, workflows and immutable revisions.
- Add server-side validation and revision diff APIs.
- Migrate away from browser-only persistence as the authoritative store.

Acceptance:
- Save/reopen works across sessions and devices through the API.
- Revision history is stable and project-scoped.
- API rejects invalid graph payloads and unauthorized access.
- No cloud credentials or real provider execution.

## Milestone 4 — Deterministic mock runner

Scope:
- Run valid workflow graphs in a worker-like isolated process.
- Simulate node states, outputs, logs, failures, timeouts and cancellation.
- Persist run and node history.
- Keep the provider adapter mock-only.

Acceptance:
- Mock run is deterministic and testable.
- Logs are redacted and clearly labeled simulated.
- No shell commands or cloud APIs are executed.
- Invalid workflows cannot run.

## Milestone 5 — Infrastructure IR and IaC preview

Scope:
- Define supported resource subset and intermediate representation.
- Generate deterministic Terraform/OpenTofu files for that subset.
- Add format/validate and plan preview in a controlled environment.
- Define import limitations and preserve unsupported constructs.

Acceptance:
- Same model + compiler version yields stable output.
- Unsupported constructs are surfaced; no silent data loss.
- Plans are previews only; apply remains disabled.
- Tests cover provider/resource relationships and destructive diffs.

## Milestone 6 — AI planner (proposal only)

Scope:
- Accept user intent and current graph context.
- Produce typed infrastructure/workflow proposals and minimal diffs.
- Validate proposals server-side.
- Show assumptions, unresolved questions and reviewable changes.

Acceptance:
- AI cannot mutate active revisions without user acceptance.
- Invalid proposals are rejected.
- No secret values or execution credentials enter prompts.
- No AI-generated code is directly executed.

## Milestone 7 — Approval and controlled execution foundation

Scope:
- Bind approval to exact graph revisions, plan digest, target, policy and expiry.
- Revalidate at worker start.
- Add audit events, cancellation and failure handling.
- Perform threat modeling and recovery testing.

Acceptance:
- Stale or mismatched approval fails closed.
- Retry requires re-plan/re-approval where applicable.
- Mock provider remains the only enabled provider.

## Milestone 8 — First real provider slice

Scope: define a narrow AWS or GCP resource/use case in a separate proposal before implementation.

Prerequisites:
- Account/project isolation model.
- Least-privilege credential flow.
- State storage/locking/backup.
- Cost guardrails and destructive-change policy.
- Worker sandbox and network egress restrictions.
- Security review and explicit owner approval.

Acceptance:
- Non-production environment only.
- Plan and diff shown before apply.
- Approval tied to immutable plan.
- Audit trail and documented recovery procedure.
- Disable/rollback procedure tested.

## Milestone 9 — Provider expansion and production hardening

Only after the first provider slice is stable:
- Add further AWS/GCP/Azure components through the catalog.
- Add Kubernetes and other integrations as separately scoped work.
- Improve import/export coverage and drift detection.
- Add tenant isolation tests, rate limits, observability, backup/recovery, incident response and security review.

## Scope control

A milestone should not be expanded mid-implementation without updating the plan and reviewing the impact. Every feature branch should contain one coherent change, tests and documentation. No feature work merges directly to `main`.
