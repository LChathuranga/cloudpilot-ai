# CloudPilot AI — Architecture v1.2 Design Pack

**Status:** Proposed design for review; not yet implementation approval  
**Decision:** Visual-first infrastructure model, paired with a separate workflow model  
**Scope:** CI/CD automation + cloud infrastructure design and provisioning in one product  
**Supersedes:** Neither v1.0 nor v1.1; those documents remain historical baselines

## Purpose

This design pack records the architecture decisions discussed for CloudPilot AI before further implementation. It distinguishes desired behavior from existing prototype behavior. The repository's current `dev` branch remains a frontend prototype; the documents here do not imply that the backend, AI planner, infrastructure canvas, provider integrations, or real execution already exist.

## Documents

1. [Architecture overview and decisions](architecture-overview.md) — product boundaries, key decisions and system diagrams.
2. [Component catalog and contracts](component-catalog.md) — component families, metadata, configuration and typed ports.
3. [Dual-canvas UI design](ui-design.md) — infrastructure canvas, workflow canvas, sidebar and interaction rules.
4. [Infrastructure model](infrastructure-model.md) — visual-first source of truth, resource graph, IaC import/export and drift.
5. [Workflow semantics](workflow-semantics.md) — graph execution, dependencies, validation, plans, approvals and run lifecycle.
6. [Backend architecture](backend-architecture.md) — Express modular monolith, storage, APIs, workers and provider adapters.
7. [Delivery roadmap](delivery-roadmap.md) — ordered design and implementation milestones with acceptance criteria.
8. [Git branching and PR flow](git-branching.md) — branch names, promotion gates and release rules.

## Agreed product direction

- One product supports both CI/CD automation and cloud infrastructure design/provisioning.
- The product has two connected but distinct visual models: an **Infrastructure Canvas** and a **Workflow Canvas**.
- Infrastructure design is visual-first. CloudPilot's supported visual model is the source of truth; Terraform/OpenTofu is generated from it. Import is supported only where the configuration can be represented safely and faithfully.
- Workflow nodes describe actions/control flow; infrastructure nodes describe desired resources and resource relationships. Their edge types and validation rules must never be conflated.
- AI proposes typed infrastructure/workflow changes. Users review and accept proposals; AI never receives direct execution authority.
- The initial runner is mock-only. Real cloud provisioning is a later, separately reviewed milestone.
- Backend implementation uses Express and PostgreSQL; execution runs in isolated workers, not inside the API process.
- `main` is stable, `dev` is integration, and short-lived feature branches merge through pull requests.

## Review rule

Treat every document as a proposal until its milestone is approved. We should agree on one milestone at a time, implement it, test it, and merge it into `dev` only after review. Promote `dev` to `main` only when the release is tested and explicitly approved.
