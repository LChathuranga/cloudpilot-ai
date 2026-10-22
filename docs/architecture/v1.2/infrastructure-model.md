# Visual-First Infrastructure Model

**Status:** Proposed design  
**Decision:** The typed visual infrastructure model is authoritative for the supported feature subset; Terraform/OpenTofu is generated from it.

## 1. Source-of-truth policy

CloudPilot stores an explicit, versioned infrastructure model. The model contains logical resources, typed configuration, relationships, provider context, module boundaries and provenance. Canvas coordinates are UI metadata and do not change infrastructure meaning.

Terraform/OpenTofu is a generated artifact for supported model features. Generated files should be reproducible from a specific model revision and compiler version.

This does **not** mean every possible Terraform configuration can be safely represented in a visual editor. Import must detect unsupported constructs and preserve them as opaque, read-only blocks or stop with a clear compatibility report. Never silently discard, normalize away or rewrite unsupported code.

## 2. Conceptual resource model

```ts
interface InfrastructureDesign {
  id: string;
  projectId: string;
  revision: number;
  providerContexts: ProviderContext[];
  resources: InfrastructureResource[];
  relationships: InfrastructureRelationship[];
  modules: InfrastructureModule[];
  compilerTarget?: { tool: "terraform" | "opentofu"; versionConstraint: string };
  metadata: { createdAt: string; createdBy: string };
}

interface InfrastructureResource {
  id: string;                 // stable logical identity
  componentType: string;      // e.g. "aws.ec2.instance"
  componentVersion: string;
  providerContextId: string;
  config: Record<string, unknown>;
  lifecycle: { protectFromDestroy?: boolean };
  provenance?: { source: "visual" | "imported" | "ai"; sourceRef?: string };
}

interface InfrastructureRelationship {
  id: string;
  fromResourceId: string;
  toResourceId: string;
  type: string;               // catalog-defined relationship
  config?: Record<string, unknown>;
}
```

This is illustrative, not a finalized schema. Actual implementation should use Zod or an equivalent runtime schema and reject unknown fields where safety requires it.

## 3. Resource identity and references

- Logical resource IDs remain stable when users move nodes or rename display labels.
- Provider-specific physical IDs (for example cloud resource IDs) are outputs/state metadata, not substitutes for logical IDs.
- A workflow references an infrastructure design revision plus logical resource ID, or explicitly references the latest approved revision under a defined policy.
- Never silently retarget a workflow to a different infrastructure revision.
- Resource deletion must identify dependent resources and workflow references before the user confirms.

## 4. Relationship types

Relationships are catalog-defined and semantically meaningful, for example:
- containment / placement (resource belongs to subnet or module);
- network association (subnet belongs to VPC/VNet);
- routing or exposure;
- attachment / usage;
- dependency;
- consumes output from another resource.

A visual line alone is not enough to infer behavior. The user or a validated provider-specific rule must establish the relationship type. Validation checks cardinality, provider compatibility, region/project compatibility and dependency cycles where relevant.

## 5. IaC generation

Proposed generation flow:

1. Validate the infrastructure model against the versioned resource catalog.
2. Resolve module and provider dependencies.
3. Build an intermediate representation (IR) independent of the UI framework.
4. Compile the supported IR into deterministic Terraform/OpenTofu files.
5. Format and run static validation using a controlled toolchain.
6. Show generated code, plan output and a resource-level diff.
7. Store generated artifacts with model revision and compiler version.
8. Only later, after approval and execution checks, allow apply through an isolated worker.

The compiler should be deterministic for a given model, compiler version and declared inputs. Do not inject secret values into generated files; use runtime references or provider-native secret resources.

## 6. Import and round-trip policy

IaC import is a capability, not a promise of full language equivalence.

- Parse using a suitable HCL/Terraform-aware parser, not regular expressions alone.
- Identify resources, variables, locals, modules, data sources, providers, outputs and expressions.
- Map supported constructs to typed visual components.
- Preserve source locations and provenance for traceability.
- For unsupported constructs, show an import report and keep them opaque/read-only or refuse editable import.
- Do not offer a destructive round-trip export when unsupported constructs would be lost.
- Show a diff before any import-derived model replaces an existing design.
- Avoid running `terraform init`, external modules or provider plugins against untrusted input without isolation and allowlists.

## 7. State, drift and reconciliation

CloudPilot model state and actual cloud state are different things:
- **Desired model:** versioned intent stored by CloudPilot.
- **Plan:** proposed changes between desired configuration and provider state.
- **Provider state:** state managed by Terraform/OpenTofu or an explicitly designed backend.
- **Observed state:** read-only inventory/drift observations from provider APIs.

Never claim a resource is deployed just because it appears on the canvas. Status should be sourced from execution results or provider observation and include freshness.

State management is security-sensitive. Before enabling real apply, define state storage, locking, encryption, backup/restore, workspace/project isolation, access control and recovery. Do not store state files or provider credentials in public repository artifacts.

## 8. First provider scope

Implement one narrow provider slice first, rather than a large catalog:
- provider context and region/project;
- one network boundary and subnet relationship;
- one compute/deployment target appropriate for a simple web app;
- one registry or artifact reference if required;
- generated IaC preview and mock plan;
- deterministic validation tests.

The exact resource subset must be approved as a separate milestone before implementation. Real cloud apply remains disabled until a security review passes.
