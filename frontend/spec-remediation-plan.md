# Frontend Spec Remediation Plan (3-Phase)

Date: 2026-03-16
Scope: Align current frontend implementation to source-of-truth specs with minimum change risk.

## Goal

Close the highest-impact gaps found in stream integration, agent-tool interaction UI, and panel-level product features.

## Priority Summary

- P0 (Must): Stream contract correctness and failure safety.
- P1 (Should): Selection Group UI contract and interaction completion.
- P2 (Could): Topic Activity and Review Inbox completion.

---

## P0: Stream Contract and Runtime Safety

### Why

Current stream path does not fully honor acceptance rules for terminal handling, append dedupe, and metadata/thought separation.

### Tasks

1. Introduce request-scoped stream reducer state.
Files:
- [ActionAct/frontend/src/features/action/actionAct/hooks/useActStream.ts](ActionAct/frontend/src/features/action/actionAct/hooks/useActStream.ts)
- [ActionAct/frontend/src/features/agentTools/runtime/act-runner.ts](ActionAct/frontend/src/features/agentTools/runtime/act-runner.ts)
- [ActionAct/frontend/src/features/graph/store.ts](ActionAct/frontend/src/features/graph/store.ts)

Work:
- Track active request_id and ignore stale updates.
- Keep request-scoped buffers for thought, answer, metadata.

2. Enforce terminal-first-only rule.
Files:
- [ActionAct/frontend/src/services/act/rpc-client.ts](ActionAct/frontend/src/services/act/rpc-client.ts)
- [ActionAct/frontend/src/features/agentTools/runtime/act-runner.ts](ActionAct/frontend/src/features/agentTools/runtime/act-runner.ts)

Work:
- Accept only first terminal for each request.
- Suppress duplicate done/error after first terminal.
- Remove double onDone path.

3. Add append dedupe and offset guards.
Files:
- [ActionAct/frontend/src/services/act/port.ts](ActionAct/frontend/src/services/act/port.ts)
- [ActionAct/frontend/src/services/act/rpc-client.ts](ActionAct/frontend/src/services/act/rpc-client.ts)
- [ActionAct/frontend/src/features/graph/store.ts](ActionAct/frontend/src/features/graph/store.ts)

Work:
- Extend patch shape to carry seq and expected_offset.
- Deduplicate by request_id + node_id + seq.
- Reject or resync on offset mismatch.

4. Add stream_parts and metadata projection.
Files:
- [ActionAct/frontend/src/services/act/rpc-client.ts](ActionAct/frontend/src/services/act/rpc-client.ts)
- [ActionAct/frontend/src/features/graph/components/GraphNodeCard.tsx](ActionAct/frontend/src/features/graph/components/GraphNodeCard.tsx)
- [ActionAct/frontend/src/features/nodeDetail/components/NodeEvidenceList.tsx](ActionAct/frontend/src/features/nodeDetail/components/NodeEvidenceList.tsx)

Work:
- Parse stream_parts thought=false/true separately.
- Keep thought out of canonical contentMd.
- Project grounding metadata to References and tool metadata to diagnostics surface.

5. Always-on grounding and thought surface.
Files:
- [ActionAct/frontend/src/features/agentTools/runtime/act-runner.ts](ActionAct/frontend/src/features/agentTools/runtime/act-runner.ts)
- [ActionAct/frontend/src/services/act/rpc-client.ts](ActionAct/frontend/src/services/act/rpc-client.ts)
- [ActionAct/frontend/src/services/actDraft/firestore.ts](ActionAct/frontend/src/services/actDraft/firestore.ts)
- [ActionAct/frontend/src/features/graph/hooks/useGraphSubscriptions.ts](ActionAct/frontend/src/features/graph/hooks/useGraphSubscriptions.ts)
- [ActionAct/frontend/src/features/graph/components/GraphNodeCard.tsx](ActionAct/frontend/src/features/graph/components/GraphNodeCard.tsx)
- [ActionAct/frontend/src/features/agentTools/runtime/frontend-tool-registry.ts](ActionAct/frontend/src/features/agentTools/runtime/frontend-tool-registry.ts)

Work:
- Force grounding and thinking on for every RunAct request.
- Remove frontend toggles that disable thought display or web grounding.
- Persist `thoughtMd` to `actDrafts` and restore it from Firestore snapshots.
- Render thought as a separate always-visible surface, not as part of canonical `contentMd`.

### Done Criteria

- No duplicated content when stream reconnects or retries.
- done/error remains stable even with duplicate terminal events.
- Thought is always collected, persisted, and rendered separately from markdown body.

---

## P1: Agent Tool Selection Group UI Completion

### Why

Tool APIs exist, but visual interaction contract is not fully rendered in canvas UI.

### Tasks

1. Render selection groups and choice nodes.
Files:
- [ActionAct/frontend/src/features/graph/components/GraphCanvas.tsx](ActionAct/frontend/src/features/graph/components/GraphCanvas.tsx)
- [ActionAct/frontend/src/features/graph/components/GraphNodeCard.tsx](ActionAct/frontend/src/features/graph/components/GraphNodeCard.tsx)
- [ActionAct/frontend/src/features/agentInteraction/store/interactionStore.ts](ActionAct/frontend/src/features/agentInteraction/store/interactionStore.ts)

Work:
- Show group header with title, instruction, status badge, counts.
- Show Confirm/Clear/Cancel controls.
- Render single vs multiple selection visuals.

2. Add layout rules for anchor and choice lane.
Files:
- [ActionAct/frontend/src/features/graph/selectors/projectActOverlay.ts](ActionAct/frontend/src/features/graph/selectors/projectActOverlay.ts)

Work:
- If anchor exists, place group near anchor right side.
- If no anchor, place in dedicated choice lane.
- Avoid overlap among pending groups.

3. Keep normal selection and selection-group selection isolated.
Files:
- [ActionAct/frontend/src/features/graph/store.ts](ActionAct/frontend/src/features/graph/store.ts)
- [ActionAct/frontend/src/features/agentInteraction/store/interactionStore.ts](ActionAct/frontend/src/features/agentInteraction/store/interactionStore.ts)

Work:
- Do not auto-mix selection group picks into selectedNodeIds.
- Keep visual semantics distinct.

### Done Criteria

- Selection state transitions match pending/selected/expired/cancelled.
- single confirms in one click; multiple confirms with explicit button.
- No automatic run starts after selection confirmation.

---

## P2: Product Surfaces (Topic Activity and Review Inbox)

### Why

Panels are placeholders and not aligned with required visibility for upload routing and ops review.

### Tasks

1. Implement Topic Activity panel.
Files:
- [ActionAct/frontend/src/features/layout/components/RightPanelRouter.tsx](ActionAct/frontend/src/features/layout/components/RightPanelRouter.tsx)
- [ActionAct/frontend/src/services/organize/port.ts](ActionAct/frontend/src/services/organize/port.ts)
- [ActionAct/frontend/src/services/organize/firestore.ts](ActionAct/frontend/src/services/organize/firestore.ts)

Work:
- Show per-input timeline: progress, resolver, draft, bundle, outline.
- Extend InputProgress shape with reason/confidence-level/error fields needed by UI.

2. Implement Review Inbox read-only MVP.
Files:
- [ActionAct/frontend/src/features/layout/components/RightPanelRouter.tsx](ActionAct/frontend/src/features/layout/components/RightPanelRouter.tsx)

Work:
- Add list of planned/approved/applied/dismissed with trace and reason.
- Keep read-only if write authority is not finalized.

3. Wire panel navigation from header/entry points.
Files:
- [ActionAct/frontend/src/features/layout/components/FloatingHeader.tsx](ActionAct/frontend/src/features/layout/components/FloatingHeader.tsx)
- [ActionAct/frontend/src/features/layout/components/AppShell.tsx](ActionAct/frontend/src/features/layout/components/AppShell.tsx)

Work:
- Add explicit navigation actions for Topic Activity and Review Inbox.

### Done Criteria

- Topic Activity is no longer placeholder and can track recent inputs.
- Review Inbox is no longer placeholder and shows state badges and trace.

---

## Execution Order and Risk

1. Start P0 first to prevent data corruption and stream regressions.
2. Deliver P1 next so agent-driven flows become user-completable.
3. Deliver P2 for product completeness.

Risk notes:
- P0 changes are state-model sensitive; add focused tests before refactor.
- P1 changes are primarily UI/state orchestration.
- P2 depends on backend fields availability; keep read-only fallback if fields are partial.

## Suggested Test Focus

- Stream duplication and terminal race tests.
- Offset mismatch handling tests.
- Selection group lifecycle and non-blocking canvas interaction tests.
- Topic activity rendering tests for each upload status.
