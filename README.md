# CloudPilot AI

AI-assisted visual deployment workflow design and automation.

CloudPilot lets users describe deployment workflows, inspect and edit a node-based graph, and safely analyze existing deployment scripts. The MVP begins with a local visual editor and mock-only execution. Real cloud provisioning is not enabled.

## Current MVP foundation

- React + TypeScript + Vite web app in a pnpm workspace
- Node-based workflow canvas powered by React Flow
- Runtime-validated workflow graph schema using Zod
- Basic graph checks for duplicate node IDs, missing connection endpoints, and self-connections
- Text-only import suggestions for `.bat`, `.cmd`, `.ps1`, `.sh`, `.yml`, and `.yaml` files
- Mock-only run action that validates the graph without executing shell commands
- Initial implementation checklist in [docs/implementation/mvp-plan.md](docs/implementation/mvp-plan.md)

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
```

## Important safety notes

- Imported files are untrusted reference material. They are read as text and never executed by the importer.
- The current script parser is a prototype heuristic, not a secure or complete parser for every shell dialect.
- AI workflow generation is planned but is not implemented yet.
- The current mock run validates the graph; it does not run workflow commands or provision cloud resources.
- Never add secrets, access tokens, or cloud credentials to the repository.

## Architecture

The original V1.0 baseline is preserved in [docs/architecture/v1.0/architecture-diagrams.md](docs/architecture/v1.0/architecture-diagrams.md). The approved design is documented in [Architecture v1.1](docs/architecture/v1.1/architecture-diagrams.md).

The implementation roadmap is [docs/implementation/mvp-plan.md](docs/implementation/mvp-plan.md). AWS ECS/Fargate and GCP Cloud Run remain future provider targets and are outside the initial MVP.
