import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
} from "firebase/firestore";

import { firestore } from "@/services/firebase/firestore";
import type { EvidenceRef, OrganizePort, TopicNode } from "./port";

function topicNodesCollection(workspaceId: string, topicId: string) {
  return collection(firestore, `workspaces/${workspaceId}/topics/${topicId}/nodes`);
}

function topicNodeDoc(workspaceId: string, topicId: string, nodeId: string) {
  return doc(firestore, `workspaces/${workspaceId}/topics/${topicId}/nodes/${nodeId}`);
}

function evidenceCollection(workspaceId: string, topicId: string, nodeId: string) {
  return collection(
    firestore,
    `workspaces/${workspaceId}/topics/${topicId}/nodes/${nodeId}/evidence`,
  );
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function mapEvidence(docId: string, data: Record<string, unknown>): EvidenceRef {
  return {
    id: readString(data.evidenceId) ?? docId,
    title: readString(data.title) ?? readString(data.label) ?? docId,
    url: readString(data.url),
    snippet:
      readString(data.snippet) ??
      readString(data.summary) ??
      readString(data.claim) ??
      readString(data.text),
  };
}

async function loadEvidenceRefs(
  workspaceId: string,
  topicId: string,
  nodeId: string,
): Promise<EvidenceRef[]> {
  const snapshot = await getDocs(evidenceCollection(workspaceId, topicId, nodeId));
  return snapshot.docs.map((evidenceDoc) =>
    mapEvidence(evidenceDoc.id, evidenceDoc.data() as Record<string, unknown>),
  );
}

async function mapTopicNode(
  workspaceId: string,
  topicId: string,
  docId: string,
  data: Record<string, unknown>,
): Promise<TopicNode> {
  const nodeId = readString(data.nodeId) ?? docId;
  const evidenceRefs = await loadEvidenceRefs(workspaceId, topicId, nodeId);

  return {
    id: nodeId,
    title: readString(data.title) ?? nodeId,
    type: readString(data.kind) ?? "concept",
    parentId: readString(data.parentId),
    contextSummary: readString(data.contextSummary),
    detailHtml: readString(data.detailHtml),
    contentMd: readString(data.contentMd),
    evidenceRefs,
  };
}

export const firestoreOrganizeService: OrganizePort = {
  subscribeTree: (workspaceId, topicId, callback) => {
    const q = query(topicNodesCollection(workspaceId, topicId), orderBy("updatedAt", "desc"));

    return onSnapshot(q, async (snapshot) => {
      const topicNodes = await Promise.all(
        snapshot.docs.map((nodeDoc) =>
          mapTopicNode(
            workspaceId,
            topicId,
            nodeDoc.id,
            nodeDoc.data() as Record<string, unknown>,
          ),
        ),
      );
      callback(topicNodes);
    });
  },

  renameNode: async (workspaceId, topicId, nodeId, newTitle) => {
    await updateDoc(topicNodeDoc(workspaceId, topicId, nodeId), {
      title: newTitle,
    });
  },

  deleteNode: async (workspaceId, topicId, nodeId) => {
    await deleteDoc(topicNodeDoc(workspaceId, topicId, nodeId));
  },

  moveNode: async (workspaceId, topicId, nodeId, newParentId) => {
    await updateDoc(topicNodeDoc(workspaceId, topicId, nodeId), {
      parentId: newParentId ?? null,
    });
  },
};
