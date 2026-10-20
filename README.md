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
