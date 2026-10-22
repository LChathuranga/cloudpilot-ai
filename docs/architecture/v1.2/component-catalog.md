# Component Catalog and Contracts

**Status:** Proposed design  
**Applies to:** Infrastructure Canvas, Workflow Canvas, AI planner, validation and execution

## 1. The component families

CloudPilot has one catalog experience, but components belong to distinct semantic families.

### A. Workflow control

Examples: Trigger, Condition, Approval, Parallel, Retry, Delay, Join, Notification.

Purpose: determine when a workflow starts, branches, pauses, retries, or continues.

### B. Engineering and workflow actions

Examples: Git checkout, Build, Test, Security Scan, Docker Build, Publish Artifact, Terraform Plan, Terraform Apply, Deploy, Health Check, Rollback.

Purpose: perform an operation or invoke an integration. These nodes have execution behavior and typed inputs/outputs.

### C. Infrastructure resources

Examples: VPC, subnet, route table, security group, load balancer, virtual machine, object storage, managed database, container registry, container service, Kubernetes cluster.

Purpose: declare desired infrastructure and resource relationships. A resource node is not itself an ordered workflow task.

### D. Integrations and credentials

Examples: GitHub connection, AWS account connection, GCP project connection, Azure subscription connection, registry connection, secret reference.

Purpose: configure access to external systems. Credentials are never stored as plaintext in component configuration.

## 2. Suggested sidebar

### Workflow Canvas
- Control Flow: Trigger, Condition, Parallel, Approval, Delay, Retry, Join
- Source Control: GitHub Checkout, GitLab Checkout
- Build & Test: Build, Unit Test, Integration Test, Package
- Containers: Docker Build, Image Scan, Push Image
- Infrastructure as Code: Validate, Plan, Approval Gate, Apply, Drift Check
- Deployment: Deploy Service, Health Check, Rollback
- Operations: Notify, Manual Task, Output/Artifact

### Infrastructure Canvas
- Provider & Project
- Networking: VPC/VNet, subnet, route, internet/NAT gateway, firewall/security group, load balancer
- Compute: VM, serverless function, container service, Kubernetes cluster
- Storage: object/blob storage, block/file storage
- Data: managed SQL, NoSQL, cache, queue
- Containers & Registry: image registry and cluster/service resources
- Identity & Security: IAM role/policy, service account, key/secret reference, security rule
- Observability: logs, metrics, alert resources where supported

The sidebar should be filtered by selected provider, enabled catalog version, project permissions and feature availability. Do not show a component as executable merely because it appears in the catalog.

## 3. Provider mapping examples

| Capability | AWS example | GCP example | Azure example |
|---|---|---|---|
| Network boundary | VPC | VPC network | Virtual Network |
| Subnet | Subnet | Subnetwork | Subnet |
| Virtual machine | EC2 instance | Compute Engine instance | Virtual Machine |
| Object storage | S3 bucket | Cloud Storage bucket | Blob Storage container |
| Container registry | ECR repository | Artifact Registry repository | Container Registry / Azure Container Registry |
| Managed container runtime | ECS/Fargate or EKS | Cloud Run or GKE | Container Apps or AKS |
| Managed relational database | RDS | Cloud SQL | Azure Database service |

These are conceptual mappings, not claims that all resources have identical features. Provider-specific settings remain explicit.

## 4. Component definition contract

Every catalog item should have a stable, namespaced identity and a versioned schema. Example conceptual shape:

```ts
type ComponentCategory =
  | "workflow-control"
  | "workflow-action"
  | "infrastructure-resource"
  | "integration";

type ProviderId = "neutral" | "aws" | "gcp" | "azure" | "kubernetes";

interface ComponentDefinition {
  type: string;              // e.g. "aws.ecs.service"
  version: string;           // catalog/schema version
  displayName: string;
  category: ComponentCategory;
  provider: ProviderId;
  description: string;
  configSchema: JsonSchema;
  inputs: PortDefinition[];
  outputs: PortDefinition[];
  capabilities: string[];
  executionKind?: "control" | "action" | "resource";
  maturity: "design" | "mock" | "preview" | "supported";
  documentationRef?: string;
}
```

This is a design illustration; implementation should select and enforce the actual TypeScript/Zod types. Avoid arbitrary executable code or plugin scripts inside catalog records.

## 5. Configuration and validation

Each component definition specifies:
- required and optional fields;
- field types, ranges, formats and defaults;
- provider/region/project requirements;
- allowed input/output port types;
- sensitive fields represented only as secret references;
- dependencies on other resources;
- lifecycle and deletion behavior;
- validation severity and user-readable messages;
- whether the component is design-only, mockable, plannable or executable.

Validation occurs at three levels:
1. **Editor feedback:** fast, helpful checks for the user.
2. **API validation:** authoritative schema, graph, project and authorization checks.
3. **Execution-time validation:** re-check component versions, policy, target and approved plan immediately before running.

## 6. Typed ports and edge types

Do not represent every edge as a generic source-to-target connection.

- Workflow control edge: execution dependency or branch transition.
- Workflow data edge: typed output consumed by another action.
- Infrastructure relationship edge: semantic resource relationship (contains, routes-to, attaches-to, uses, exposes, depends-on).
- Cross-model reference: workflow action targets an infrastructure resource or a specific infrastructure revision.

An edge must carry a stable ID, source/target IDs, edge type and any required port IDs. Reject incompatible port types and invalid provider/resource relationships.

## 7. Identity and references

- Component type IDs are stable, namespaced strings, not display labels.
- Node IDs are unique within a graph revision.
- Resource logical IDs remain stable across visual repositioning and revisions.
- Workflow nodes reference infrastructure by project + design revision + logical resource ID; they must not rely on canvas coordinates or labels.
- Component definition versions are pinned to graph revisions to avoid silent behavior changes.

## 8. Catalog expansion policy

Add components incrementally. Each component requires:
1. schema and typed ports;
2. visual representation and property editor;
3. graph validation;
4. mock behavior or a clearly declared design-only status;
5. IaC mapping if it is an infrastructure resource;
6. tests and documentation;
7. provider-specific safety notes.

Do not add dozens of icons first and invent behavior later. A component is complete only when its meaning, configuration, validation and lifecycle are defined.
