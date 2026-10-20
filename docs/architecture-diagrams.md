# CloudPilot AI — Architecture Diagrams (v1.0)

**Document version:** 1.0  
**Architecture scope:** CloudPilot AI V1.0 — initial design baseline  
**Scope:** Local mock deployment MVP first. Real cloud provisioning is explicitly out of scope for this milestone.

This document defines the V1.0 architecture baseline only. Later versions may revise or extend it; future delivery phases below are roadmap proposals, not features included in V1.0. These diagrams describe the intended architecture, not a claim that every component has been implemented.

## 1. System context

```mermaid
flowchart LR
    Dev[Developer / small business] -->|Project settings and deployment request| UI[CloudPilot Web UI]
    UI --> API[CloudPilot API]
    API --> Auth[Identity and access control]
    API --> DB[(PostgreSQL: projects, deployments, approvals)]
    API --> Queue[(Job queue)]
    Queue --> Worker[Isolated deployment worker]
    Worker --> Schema[Deployment schema validation]
    Worker --> Policy[Deterministic policy engine]
    Worker --> Plan[Plan / diff generator]
    Plan --> Approval[Approval gate]
    Approval --> Audit[(Append-only audit events)]
    Approval --> Provider[Provider adapter]
    Provider -. "MVP: simulated only" .-> Mock[Mock provider]
    Provider -. "Future, after approval" .-> Cloud[Cloud provider APIs]
    API --> AI[AI planner]
    AI -->|Typed spec proposal only| API
    AI -. "No direct credentials or execution" .-> Worker
```

### Main boundaries

- **Control plane:** web UI, API, identity, project/deployment metadata, and approvals.
- **AI planning:** converts user intent into a typed deployment-spec proposal. It does not receive privileged cloud credentials and does not run commands.
- **Execution plane:** an isolated worker validates the exact spec, evaluates deterministic policies, and invokes an allowlisted provider adapter only after approval.
- **MVP boundary:** the provider adapter is a mock. No cloud API calls, infrastructure changes, or real secrets are needed.

## 2. Deployment request and approval sequence

```mermaid
sequenceDiagram
    actor User
    participant UI as Web UI
    participant API as API / Control plane
    participant AI as AI planner
    participant Validator as Schema + policy checks
    participant Plan as Plan generator
    participant Store as Database + audit log
    participant Worker as Isolated worker
    participant Provider as Provider adapter

    User->>UI: Describe desired deployment
    UI->>API: Submit request
    API->>AI: Request typed spec proposal
    AI-->>API: Proposed spec patch (untrusted)
    API->>Validator: Validate schema and policy
    Validator-->>API: Errors or validated spec
    API->>Plan: Generate deterministic plan/diff
    Plan-->>API: Plan + immutable digest
    API->>Store: Save spec version, plan digest, policy result
    API-->>UI: Show plan and risks
    User->>UI: Approve exact plan
    UI->>API: Approval for digest + version + target + expiry
    API->>Store: Record approval and audit event
    API->>Worker: Enqueue approved plan reference
    Worker->>Store: Re-read plan, approval, and current spec version
    Worker->>Validator: Re-check policy and approval binding
    alt Approval valid and plan unchanged
        Worker->>Provider: Execute allowlisted operation
        Provider-->>Worker: Mock result in MVP
        Worker->>Store: Record outcome and audit events
        Worker-->>API: Deployment status
        API-->>UI: Show result
    else Stale, expired, or mismatched approval
        Worker->>Store: Record rejection
        Worker-->>API: Stop without executing
        API-->>UI: Request a fresh plan and approval
    end
```

## 3. Deployment lifecycle state machine

```mermaid
stateDiagram-v2
    [*] --> Draft
    Draft --> Validating: Submit
    Validating --> Rejected: Schema or policy errors
    Rejected --> Draft: Edit configuration
    Validating --> Planned: Valid spec and plan generated
    Planned --> AwaitingApproval: Show plan and risks
    AwaitingApproval --> Cancelled: User cancels
    AwaitingApproval --> Approved: Approve exact digest
    Approved --> Revalidating: Worker starts
    Revalidating --> Stale: Spec, target, policy, or digest changed
    Revalidating --> Executing: Approval valid and unexpired
    Executing --> Succeeded: Provider confirms success
    Executing --> Failed: Execution error
    Stale --> Planned: Generate fresh plan
    Failed --> Planned: Retry only after re-plan and re-approval
    Succeeded --> [*]
    Cancelled --> [*]
```

**Invariant:** any change to the deployment spec, target account/project, environment, policy version, or plan digest invalidates the old approval. A retry must not silently reuse a stale approval.

## 4. Security and trust boundaries

```mermaid
flowchart TB
    subgraph Untrusted["Untrusted inputs"]
        Prompt[User prompt]
        Repo[Repository contents / build metadata]
        Model[AI-generated proposal]
    end

    subgraph Control["Control plane — authenticated and audited"]
        API[API and authorization]
        Spec[Typed spec parser]
        Policy[Deterministic policy checks]
        Plan[Plan + canonical digest]
        Gate[Human approval bound to digest]
        DB[(Deployment metadata and audit events)]
    end

    subgraph Execution["Execution plane — isolated worker"]
        Recheck[Re-check spec, digest, target, policy, expiry]
        Adapter[Allowlisted provider adapter]
        Sandbox[Restricted execution environment]
    end

    subgraph External["External infrastructure"]
        Secrets[Secret manager: references only]
        Cloud[Cloud APIs — future phase]
        Mock[Mock provider — MVP]
    end

    Prompt --> API
    Repo --> API
    Model -->|Proposal only| Spec
    API --> Spec --> Policy --> Plan --> Gate
    API <--> DB
    Gate -->|Approved immutable reference| Recheck
    DB --> Recheck
    Recheck --> Adapter
    Adapter --> Sandbox
    Sandbox --> Mock
    Sandbox -. "Future provider, least privilege" .-> Cloud
    Adapter -. "Resolve at execution time; never log values" .-> Secrets
```

### Required security rules

1. Treat prompts, repository files, build output, and AI proposals as untrusted input.
2. Parse AI output into a versioned schema; reject unknown or invalid fields.
3. The model must never supply shell commands for privileged execution.
4. Generate a canonical plan digest and bind approval to the digest, spec version, target, environment, policy version, and expiry.
5. Revalidate immediately before execution; stale or mismatched approvals fail closed.
6. Use least-privilege, short-lived credentials in the future execution plane. Store secret references, not secret values, in deployment specs or logs.
7. Keep audit events for proposals, validation decisions, approvals, starts, results, and denials.
8. Make the mock provider the only provider implementation enabled in the first milestone.

## 5. Initial monorepo module map

```mermaid
flowchart LR
    subgraph Apps["apps/"]
        Worker["worker — mock lifecycle runner"]
        API["api — future control-plane HTTP API"]
        Web["web — future deployment UI"]
    end

    subgraph Packages["packages/"]
        Schema["deployment-schema — shared runtime validation and types"]
        Policy["policy-engine — deterministic rules (next phase)"]
        Provider["provider-adapter — allowlisted operations (later)"]
    end

    Worker --> Schema
    Worker -. "later" .-> Policy
    Worker -. "later" .-> Provider
    API --> Schema
    API -. "later" .-> Policy
    Web --> API
```

## 6. Delivery phases

- **Phase 0 — Design:** agree on these boundaries, lifecycle states, and security invariants.
- **Phase 1 — Local mock MVP:** typed deployment spec, validation tests, simulated deployment lifecycle, documentation, and CI.
- **Phase 2 — Control plane:** API, persistence, authentication, deployment history, and approval records.
- **Phase 3 — UI and AI planner:** project configuration UI and AI-generated typed proposals, with no execution authority.
- **Phase 4 — Provider integration:** isolated worker, provider-specific plans, least-privilege credentials, immutable approvals, audit and rollback strategy. Start with a non-production AWS target.
- **Phase 5 — Production hardening:** threat modeling, tenant isolation, rate limits, observability, incident response, and security review.

## Decision needed before real cloud deployment

Before enabling any real provider, define the exact supported operations, account/project isolation model, credential lifecycle, rollback behavior, and approval policy. Until then, keep all deployment runs simulated.
