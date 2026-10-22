# CloudPilot AI

AI-assisted visual infrastructure design and deployment workflow automation.

CloudPilot AI is planned as one platform combining a visual infrastructure designer, a visual CI/CD workflow editor, AI-generated proposals, and safe, reviewed provisioning. The current `dev` branch remains a frontend prototype; this repository does not yet implement the full backend, AI planner, infrastructure compiler or real cloud execution.

## Current frontend foundation

- React + TypeScript + Vite web app in a pnpm workspace
- Node-based workflow canvas powered by React Flow
- Runtime-validated workflow graph schema using Zod
- Shared typed component contracts and separate workflow/infrastructure graph core (Milestone 1 branch)
- Basic graph validation
- Unit tests for graph-core contracts and validation
- Text-only import suggestions for supported deployment files
- Mock/validation-oriented workflow behavior; no real cloud provisioning

## Run locally

Requirements: Node.js 20+ and pnpm.

```bash
pnpm install
pnpm dev
```

For a production build:

```bash
pnpm build
pnpm typecheck
pnpm test
```

## Safety notes

- Imported files are untrusted reference material; the importer must never execute them.
- AI workflow generation and infrastructure design are planned capabilities, not claims about the current implementation.
- Mock execution does not run deployment commands or provision cloud resources.
- Never commit secrets, access tokens, Terraform state, or cloud credentials.

## Architecture and design

- [Architecture v1.2 design pack](docs/architecture/v1.2/README.md) — proposed architecture, component catalog, dual-canvas UI, visual-first infrastructure model, workflow semantics, Express backend, roadmap and Git workflow.
- [Architecture v1.1 baseline](docs/architecture/v1.1/architecture-diagrams.md) — prior design for AI workflow proposals and safe deployment-file import.
- [Architecture v1.0 baseline](docs/architecture/v1.0/architecture-diagrams.md) — original mock-first design.
- [MVP implementation checklist](docs/implementation/mvp-plan.md).

Architecture v1.2 is approved as the product design. Approval does not mean every described feature has already been implemented; implementation remains milestone-based. Work should proceed milestone by milestone through short-lived branches and pull requests into `dev`. Only reviewed and explicitly approved releases should be merged from `dev` into `main`.
