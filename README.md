# CloudPilot AI

AI-assisted cloud deployment and infrastructure automation.

## First milestone

Build and test a safe local mock deployment workflow before connecting any cloud provider. The AI layer may propose a typed deployment specification, but it must never execute arbitrary AI-generated commands with privileged credentials.

## Planned architecture

- TypeScript monorepo with pnpm
- Runtime-validated deployment specification
- Local mock deployment worker
- Deterministic policy checks and explicit approval before any future real deployment
- AWS ECS/Fargate as a later provider target; GCP Cloud Run may follow

**Current status:** repository bootstrap. No cloud resources are provisioned by this project yet.


## Architecture

The original V1.0 baseline is preserved in [docs/architecture/v1.0/architecture-diagrams.md](docs/architecture/v1.0/architecture-diagrams.md). The current proposed design is [Architecture v1.1](docs/architecture/v1.1/architecture-diagrams.md), which adds a visual node-based workflow editor, AI-generated and editable workflows, and safe import of deployment files such as Windows `.bat` scripts.

**Current design:** V1.1 proposal. The first implementation should still use mock execution; real cloud provisioning is not enabled.
