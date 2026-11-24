# Shared TypeScript contracts

Keep cross-feature domain contracts in this directory so the UI, future Express API, validators, importers, and AI proposal boundary can share one source of truth.

## Rules

- Define runtime schemas with Zod and infer TypeScript types from those schemas where possible.
- Keep workflow graph semantics and infrastructure graph semantics separate.
- Put reusable domain IDs, component contracts, ports, graph types, and validation results here.
- Keep React component props, canvas layout state, and other presentation-only types beside the UI component that owns them.
- Do not use `any` for domain data. Use `unknown` at untrusted boundaries, then parse it with a schema.
- Keep component configuration validation in the component catalog/schema; do not trust UI validation alone when the API is added.
- Treat graph `version` as a saved revision number and `schemaVersion` as the data-contract version.
- Preserve stable IDs when moving nodes. Canvas coordinates are presentation state, not graph meaning.
- Never add real provider execution or credential handling to the graph core.

## Current modules

- `component-contract.ts`: component metadata, typed ports, config validation and schema versioning.
- `catalog.ts`: deliberately small workflow and design-only infrastructure sample catalog.
- `graph-core.ts`: separate workflow/infrastructure graph schemas and validators.
- `index.ts`: shared exports.

The existing editor's `workflow/schema.ts` is a compatibility boundary while its validation API is migrated to the shared schema.
