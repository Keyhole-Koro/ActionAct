import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  type DocumentData,
} from "firebase/firestore";

import { firestore } from "@/services/firebase/firestore";
import type { PatchOp } from "@/services/act/port";
import type { TopicNode } from "@/services/organize/port";

const DRAFT_TTL_MS = 72 * 60 * 60 * 1000;

function draftsCollection(workspaceId: string) {
  return collection(firestore, `workspaces/${workspaceId}/actDrafts`);
}

function draftDoc(workspaceId: string, nodeId: string) {
  return doc(firestore, `workspaces/${workspaceId}/actDrafts/${nodeId}`);
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function readStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const values = value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
  return values.length > 0 ? values : undefined;
}

function readBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function readNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function expiredAt(data: DocumentData): boolean {
  if (data.pinned) {
    return false;
  }
  const expiresAt = data.expiresAt;
  if (!expiresAt || typeof expiresAt.toDate !== "function") {
    return false;
  }
  return expiresAt.toDate().getTime() <= Date.now();
}

function toTopicNode(nodeId: string, data: DocumentData): TopicNode {
  const resolvedTitle = readString(data.title) ?? readString(data.label) ?? "";
  return {
    id: nodeId,
    title: resolvedTitle,
    kind: readString(data.kind) ?? "act",
    status: readString(data.status) === "running" || readString(data.status) === "completed" || readString(data.status) === "failed"
      ? readString(data.status) as "running" | "completed" | "failed"
      : undefined,
    agentRole: readString(data.agentRole) === "search" ? "search" : undefined,
    createdBy: readString(data.createdBy) === "user" ? "user" : readString(data.createdBy) === "agent" ? "agent" : undefined,
    authorUid: readString(data.authorUid),
    topicId: readString(data.topicId),
    parentId: readString(data.parentId),
    referencedNodeIds: readStringArray(data.referencedNodeIds),
    isManualPosition: readBoolean(data.isManualPosition),
    positionX: readNumber(data.positionX),
    positionY: readNumber(data.positionY),
    contentMd: readString(data.contentMd),
    thoughtMd: readString(data.thoughtMd),
    contextSummary: readString(data.contextSummary),
    detailHtml: readString(data.detailHtml),
    evidenceRefs: [],
  };
}

export const actDraftService = {
  subscribeDrafts(workspaceId: string, callback: (nodes: TopicNode[]) => void) {
    const q = query(draftsCollection(workspaceId), orderBy("lastTouchedAt", "desc"));

    return onSnapshot(q, (snapshot) => {
      const nextNodes = snapshot.docs.flatMap((draftSnapshot) => {
        const data = draftSnapshot.data();
        if (expiredAt(data)) {
          return [];
        }
        return [toTopicNode(draftSnapshot.id, data)];
      });

      callback(nextNodes);
    });
  },

  /**
   * Full write for a draft node. Always supply createdBy — this is the source of truth
   * for user/agent attribution and must not be omitted or defaulted silently.
   * For metadata-only updates (e.g. title rename), use patchDraft instead.
   */
  async saveDraftSnapshot(
    workspaceId: string,
    nodeId: string,
    draft: { title?: string; kind?: string; status?: 'running' | 'completed' | 'failed'; agentRole?: 'search'; contentMd?: string; thoughtMd?: string; referencedNodeIds?: string[]; createdBy: 'user' | 'agent'; authorUid?: string; parentId?: string; topicId?: string; isManualPosition?: boolean; positionX?: number; positionY?: number },
  ) {
    await setDoc(
      draftDoc(workspaceId, nodeId),
      {
        nodeId,
        topicId: draft.topicId ?? '',
        title: draft.title ?? "",
        kind: draft.kind ?? "act",
        ...(draft.status !== undefined ? { status: draft.status } : {}),
        ...(draft.agentRole !== undefined ? { agentRole: draft.agentRole } : {}),
        createdBy: draft.createdBy,
        ...(draft.authorUid !== undefined ? { authorUid: draft.authorUid } : {}),
        contentMd: draft.contentMd ?? "",
        thoughtMd: draft.thoughtMd ?? "",
        referencedNodeIds: draft.referencedNodeIds ?? [],
        ...(draft.parentId !== undefined ? { parentId: draft.parentId } : {}),
        ...(draft.isManualPosition !== undefined ? { isManualPosition: draft.isManualPosition } : {}),
        ...(draft.positionX !== undefined ? { positionX: draft.positionX } : {}),
        ...(draft.positionY !== undefined ? { positionY: draft.positionY } : {}),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        lastTouchedAt: serverTimestamp(),
        expiresAt: new Date(Date.now() + DRAFT_TTL_MS),
        pinned: false,
      },
      { merge: true },
    );
  },

  async applyPatch(workspaceId: string, patch: PatchOp, queryText: string, authorUid?: string) {
    const payload = {
      nodeId: patch.nodeId,
      topicId: patch.data?.topicId ?? '',
      title: patch.data?.label ?? queryText,
      kind: patch.data?.kind ?? "act",
      ...(patch.data?.status !== undefined ? { status: patch.data.status } : {}),
      ...(patch.data?.agentRole !== undefined ? { agentRole: patch.data.agentRole } : {}),
      createdBy: patch.data?.createdBy ?? "agent",
      ...(authorUid !== undefined ? { authorUid } : {}),
      referencedNodeIds: patch.data?.referencedNodeIds ?? [],
      ...(patch.data?.parentId !== undefined ? { parentId: patch.data.parentId } : {}),
      ...(patch.data?.contentMd !== undefined ? { contentMd: patch.data.contentMd } : {}),
      ...(patch.data?.thoughtMd !== undefined ? { thoughtMd: patch.data.thoughtMd } : {}),
      lastTouchedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      expiresAt: new Date(Date.now() + DRAFT_TTL_MS),
      pinned: false,
    };
    await setDoc(draftDoc(workspaceId, patch.nodeId), payload, { merge: true });
  },

  /**
   * Partial update for a draft node. Only the explicitly provided fields are written.
   * Never touches createdBy — use saveDraftSnapshot for full writes that set attribution.
   */
  async patchDraft(
    workspaceId: string,
    nodeId: string,
    fields: { title?: string; contentMd?: string; thoughtMd?: string; positionX?: number; positionY?: number },
  ) {
    const payload: Record<string, unknown> = {
      updatedAt: serverTimestamp(),
      lastTouchedAt: serverTimestamp(),
      expiresAt: new Date(Date.now() + DRAFT_TTL_MS),
    };
    if (fields.title !== undefined) payload.title = fields.title;
    if (fields.contentMd !== undefined) payload.contentMd = fields.contentMd;
    if (fields.thoughtMd !== undefined) payload.thoughtMd = fields.thoughtMd;
    if (fields.positionX !== undefined) payload.positionX = fields.positionX;
    if (fields.positionY !== undefined) payload.positionY = fields.positionY;
    await updateDoc(draftDoc(workspaceId, nodeId), payload);
  },

  async touchDraft(workspaceId: string, nodeId: string) {
    await updateDoc(draftDoc(workspaceId, nodeId), {
      lastTouchedAt: serverTimestamp(),
      expiresAt: new Date(Date.now() + DRAFT_TTL_MS),
    });
  },

  async renameDraft(workspaceId: string, nodeId: string, newTitle: string) {
    await updateDoc(draftDoc(workspaceId, nodeId), {
      title: newTitle,
      updatedAt: serverTimestamp(),
      lastTouchedAt: serverTimestamp(),
      expiresAt: new Date(Date.now() + DRAFT_TTL_MS),
    });
  },

  async deleteDraft(workspaceId: string, nodeId: string) {
    await deleteDoc(draftDoc(workspaceId, nodeId));
  },
};
