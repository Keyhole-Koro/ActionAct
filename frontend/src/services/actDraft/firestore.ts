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

function draftsCollection(workspaceId: string, topicId: string) {
  return collection(firestore, `workspaces/${workspaceId}/topics/${topicId}/actDrafts`);
}

function draftDoc(workspaceId: string, topicId: string, nodeId: string) {
  return doc(firestore, `workspaces/${workspaceId}/topics/${topicId}/actDrafts/${nodeId}`);
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
  return {
    id: nodeId,
    title: readString(data.title) ?? nodeId,
    kind: readString(data.kind) ?? "act",
    createdBy: readString(data.createdBy) === "user" ? "user" : readString(data.createdBy) === "agent" ? "agent" : undefined,
    topicId: readString(data.topicId),
    parentId: readString(data.parentId),
    referencedNodeIds: readStringArray(data.referencedNodeIds),
    contentMd: readString(data.contentMd),
    contextSummary: readString(data.contextSummary),
    detailHtml: readString(data.detailHtml),
    evidenceRefs: [],
  };
}

export const actDraftService = {
  subscribeDrafts(workspaceId: string, topicId: string, callback: (nodes: TopicNode[]) => void) {
    const q = query(draftsCollection(workspaceId, topicId), orderBy("lastTouchedAt", "desc"));

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

  async saveDraftSnapshot(
    workspaceId: string,
    topicId: string,
    nodeId: string,
    draft: { title?: string; kind?: string; contentMd?: string; referencedNodeIds?: string[]; createdBy?: 'user' | 'agent'; parentId?: string },
  ) {
    await setDoc(
      draftDoc(workspaceId, topicId, nodeId),
      {
        nodeId,
        topicId,
        title: draft.title ?? nodeId,
        kind: draft.kind ?? "act",
        createdBy: draft.createdBy ?? "agent",
        contentMd: draft.contentMd ?? "",
        referencedNodeIds: draft.referencedNodeIds ?? [],
        ...(draft.parentId !== undefined ? { parentId: draft.parentId } : {}),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        lastTouchedAt: serverTimestamp(),
        expiresAt: new Date(Date.now() + DRAFT_TTL_MS),
        pinned: false,
      },
      { merge: true },
    );
  },

  async applyPatch(workspaceId: string, topicId: string, patch: PatchOp, queryText: string) {
    const payload = {
      nodeId: patch.nodeId,
      topicId,
      title: patch.data?.label ?? queryText,
      kind: patch.data?.kind ?? "act",
      createdBy: patch.data?.createdBy ?? "agent",
      referencedNodeIds: patch.data?.referencedNodeIds ?? [],
      ...(patch.data?.parentId !== undefined ? { parentId: patch.data.parentId } : {}),
      ...(patch.data?.contentMd !== undefined ? { contentMd: patch.data.contentMd } : {}),
      lastTouchedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      expiresAt: new Date(Date.now() + DRAFT_TTL_MS),
      pinned: false,
    };
    await setDoc(draftDoc(workspaceId, topicId, patch.nodeId), payload, { merge: true });
  },

  async touchDraft(workspaceId: string, topicId: string, nodeId: string) {
    await updateDoc(draftDoc(workspaceId, topicId, nodeId), {
      lastTouchedAt: serverTimestamp(),
      expiresAt: new Date(Date.now() + DRAFT_TTL_MS),
    });
  },

  async renameDraft(workspaceId: string, topicId: string, nodeId: string, newTitle: string) {
    await updateDoc(draftDoc(workspaceId, topicId, nodeId), {
      title: newTitle,
      updatedAt: serverTimestamp(),
      lastTouchedAt: serverTimestamp(),
      expiresAt: new Date(Date.now() + DRAFT_TTL_MS),
    });
  },

  async deleteDraft(workspaceId: string, topicId: string, nodeId: string) {
    await deleteDoc(draftDoc(workspaceId, topicId, nodeId));
  },
};
