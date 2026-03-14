import {
  collection,
  deleteDoc,
  doc,
  getDoc,
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
    type: readString(data.kind) ?? "act",
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
          void deleteDoc(draftSnapshot.ref);
          return [];
        }
        return [toTopicNode(draftSnapshot.id, data)];
      });

      callback(nextNodes);
    });
  },

  async applyPatch(workspaceId: string, topicId: string, patch: PatchOp, queryText: string) {
    const basePayload = {
      nodeId: patch.nodeId,
      title: patch.data?.label ?? queryText,
      kind: patch.data?.type ?? "act",
      lastTouchedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      expiresAt: new Date(Date.now() + DRAFT_TTL_MS),
      pinned: false,
    };

    if (patch.type === "upsert") {
      await setDoc(
        draftDoc(workspaceId, topicId, patch.nodeId),
        {
          ...basePayload,
          contentMd: patch.data?.contentMd ?? "",
          createdAt: serverTimestamp(),
        },
        { merge: true },
      );
      return;
    }

    if (patch.type === "append_md") {
      const ref = draftDoc(workspaceId, topicId, patch.nodeId);
      const snapshot = await getDoc(ref);
      const existing = snapshot.exists() ? readString(snapshot.data().contentMd) ?? "" : "";
      await setDoc(
        ref,
        {
          ...basePayload,
          contentMd: existing + (patch.data?.contentMd ?? ""),
          createdAt: serverTimestamp(),
        },
        { merge: true },
      );
    }
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
