import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
  type Unsubscribe,
} from "firebase/firestore";

import { firestore } from "@/services/firebase/firestore";
import type { EvidenceRef, InputProgress, InputProgressStatus, OrganizePort, TopicNode } from "./port";

function topicsCollection(workspaceId: string) {
  return collection(firestore, `workspaces/${workspaceId}/topics`);
}

function topicNodesCollection(workspaceId: string, topicId: string) {
  return collection(firestore, `workspaces/${workspaceId}/topics/${topicId}/nodes`);
}

function topicNodeDoc(workspaceId: string, topicId: string, nodeId: string) {
  return doc(firestore, `workspaces/${workspaceId}/topics/${topicId}/nodes/${nodeId}`);
}

function inputProgressDoc(workspaceId: string, topicId: string, inputId: string) {
  return doc(firestore, `workspaces/${workspaceId}/topics/${topicId}/inputProgress/${inputId}`);
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
    topicId,
    title: readString(data.title) ?? nodeId,
    kind: readString(data.kind),
    parentId: readString(data.parentId),
    contextSummary: readString(data.contextSummary),
    detailHtml: readString(data.detailHtml),
    contentMd: readString(data.contentMd),
    evidenceRefs,
  };
}

function flattenTopicNodes(topicNodesByTopic: Map<string, TopicNode[]>): TopicNode[] {
  return [...topicNodesByTopic.values()]
    .flat()
    .sort((left, right) => left.id.localeCompare(right.id));
}

function readInputProgress(
  workspaceId: string,
  topicId: string,
  inputId: string,
  data: Record<string, unknown> | undefined,
): InputProgress | null {
  if (!data) {
    return null;
  }

  const status = readString(data.status) as InputProgressStatus | undefined;
  if (!status) {
    return null;
  }

  return {
    inputId: readString(data.inputId) ?? inputId,
    topicId: readString(data.topicId) ?? topicId,
    workspaceId: readString(data.workspaceId) ?? workspaceId,
    status,
    currentPhase: readString(data.currentPhase),
    lastEventType: readString(data.lastEventType),
  };
}

export const firestoreOrganizeService: OrganizePort = {
  subscribeTree: (workspaceId, _topicId, callback) => {
    const topicNodesByTopic = new Map<string, TopicNode[]>();
    const nodeUnsubscribers = new Map<string, Unsubscribe>();

    const unsubscribeTopics = onSnapshot(
      query(topicsCollection(workspaceId), orderBy("updatedAt", "desc")),
      (topicSnapshot) => {
        const nextTopicIds = new Set(topicSnapshot.docs.map((topicDoc) => topicDoc.id));

        for (const [topicId, unsubscribeNodes] of nodeUnsubscribers.entries()) {
          if (nextTopicIds.has(topicId)) {
            continue;
          }
          unsubscribeNodes();
          nodeUnsubscribers.delete(topicId);
          topicNodesByTopic.delete(topicId);
        }

        for (const topicDoc of topicSnapshot.docs) {
          const topicId = topicDoc.id;
          if (nodeUnsubscribers.has(topicId)) {
            continue;
          }

          const unsubscribeNodes = onSnapshot(
            query(topicNodesCollection(workspaceId, topicId), orderBy("updatedAt", "desc")),
            async (nodeSnapshot) => {
              const topicNodes = await Promise.all(
                nodeSnapshot.docs.map((nodeDoc) =>
                  mapTopicNode(
                    workspaceId,
                    topicId,
                    nodeDoc.id,
                    nodeDoc.data() as Record<string, unknown>,
                  ),
                ),
              );
              topicNodesByTopic.set(topicId, topicNodes);
              callback(flattenTopicNodes(topicNodesByTopic));
            },
          );

          nodeUnsubscribers.set(topicId, unsubscribeNodes);
        }

        callback(flattenTopicNodes(topicNodesByTopic));
      },
    );

    return () => {
      unsubscribeTopics();
      for (const unsubscribeNodes of nodeUnsubscribers.values()) {
        unsubscribeNodes();
      }
    };
  },

  subscribeInputProgress: (workspaceId, topicId, inputId, callback) => onSnapshot(
    inputProgressDoc(workspaceId, topicId, inputId),
    (snapshot) => {
      callback(readInputProgress(
        workspaceId,
        topicId,
        inputId,
        snapshot.exists() ? snapshot.data() as Record<string, unknown> : undefined,
      ));
    },
  ),

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

  uploadInput: async (workspaceId, file) => {
    const { getFirebaseIdToken } = await import("@/services/firebase/token");
    const token = await getFirebaseIdToken();

    const formData = new FormData();
    formData.append("workspace_id", workspaceId);
    formData.append("file", file);

    const { config } = await import("@/lib/config");
    const res = await fetch(`${config.actApiBaseUrl}/api/upload`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
      },
      credentials: "include",
      body: formData,
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Upload failed: ${res.status} ${text}`);
    }

    const json = (await res.json()) as { input_id: string };
    return { inputId: json.input_id };
  },
};
