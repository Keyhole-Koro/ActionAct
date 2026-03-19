import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
} from "firebase/firestore";

import { firestore } from "@/services/firebase/firestore";
import type { EvidenceRef, InputProgress, InputProgressStatus, OrganizePort, ReviewOpItem, ReviewOpState, TopicActivityItem, TopicNode } from "./port";

function workspaceNodesCollection(workspaceId: string) {
  return collection(firestore, `workspaces/${workspaceId}/nodes`);
}

function workspaceNodeDoc(workspaceId: string, nodeId: string) {
  return doc(firestore, `workspaces/${workspaceId}/nodes/${nodeId}`);
}

function inputProgressDoc(workspaceId: string, inputId: string) {
  return doc(firestore, `workspaces/${workspaceId}/inputProgress/${inputId}`);
}

function inputProgressCollection(workspaceId: string) {
  return collection(firestore, `workspaces/${workspaceId}/inputProgress`);
}

function organizeOpsCollection(workspaceId: string) {
  return collection(firestore, `workspaces/${workspaceId}/organizeOps`);
}

function evidenceCollection(workspaceId: string, nodeId: string) {
  return collection(
    firestore,
    `workspaces/${workspaceId}/nodes/${nodeId}/evidence`,
  );
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function readBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function readNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
}

function readTimestampMillis(value: unknown): number | null {
  if (typeof value === "object" && value !== null && "toMillis" in value && typeof (value as { toMillis: () => number }).toMillis === "function") {
    return (value as { toMillis: () => number }).toMillis();
  }
  return null;
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

function mapTopicNode(
  docId: string,
  data: Record<string, unknown>,
): TopicNode {
  const nodeId = readString(data.nodeId) ?? docId;

  return {
    id: nodeId,
    topicId: readString(data.topicId),
    inputId: readString(data.sourceInputId),
    title: readString(data.title) ?? nodeId,
    kind: readString(data.kind),
    parentId: readString(data.parentId),
    contextSummary: readString(data.contextSummary),
    detailHtml: readString(data.detailHtml),
    contentMd: readString(data.contentMd),
  };
}

function readInputProgress(
  workspaceId: string,
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
    topicId: readString(data.topicId) ?? '',
    workspaceId: readString(data.workspaceId) ?? workspaceId,
    status,
    currentPhase: readString(data.currentPhase),
    lastEventType: readString(data.lastEventType),
    traceId: readString(data.traceId),
    resolutionMode: readString(data.resolutionMode),
    resolvedTopicId: readString(data.resolvedTopicId),
    errorCode: readString(data.errorCode),
    errorMessage: readString(data.errorMessage),
    createdAt: readTimestampMillis(data.createdAt),
    updatedAt: readTimestampMillis(data.updatedAt),
    completedAt: readTimestampMillis(data.completedAt),
  };
}

function readTopicActivity(
  workspaceId: string,
  inputId: string,
  data: Record<string, unknown>,
): TopicActivityItem | null {
  const base = readInputProgress(workspaceId, inputId, data);
  if (!base) {
    return null;
  }

  return {
    ...base,
    draftVersion: readNumber(data.draftVersion),
    draftSummary: readString(data.draftSummary),
    bundleId: readString(data.bundleId),
    bundleSummary: readString(data.bundleSummary) ?? readString(data.bundleDescription),
    hasSchemaChange: readBoolean(data.hasSchemaChange) ?? readBoolean(data.schemaChange),
    outlineVersion: readNumber(data.outlineVersion),
    outlineSummary: readString(data.outlineSummary),
    changedNodeCount: readNumber(data.changedNodeCount),
  };
}

function normalizeReviewState(value: string | undefined): ReviewOpState {
  switch (value) {
    case "approved":
    case "applied":
    case "dismissed":
      return value;
    case "planned":
    case "proposed":
    default:
      return "planned";
  }
}

function readReviewOp(
  workspaceId: string,
  opId: string,
  data: Record<string, unknown>,
): ReviewOpItem {
  const opType = readString(data.opType) ?? "unknown";
  return {
    opId,
    topicId: readString(data.topicId) ?? '',
    workspaceId: readString(data.workspaceId) ?? workspaceId,
    title: readString(data.title) ?? `${opType} proposal`,
    opType,
    state: normalizeReviewState(readString(data.status) ?? readString(data.state)),
    reason: readString(data.reason),
    traceId: readString(data.traceId),
    sourceEventType: readString(data.sourceEventType),
    nodeIds: readStringArray(data.nodeIds),
    generation: readNumber(data.generation),
    requiresHumanReview: readBoolean(data.requiresHumanReview),
    initiator: readString(data.initiator),
    createdAt: readTimestampMillis(data.createdAt),
    updatedAt: readTimestampMillis(data.updatedAt),
  };
}

export const firestoreOrganizeService: OrganizePort = {
  subscribeTree: (workspaceId, callback) => onSnapshot(
    query(workspaceNodesCollection(workspaceId), orderBy("updatedAt", "desc")),
    (nodeSnapshot) => {
      const topicNodes = nodeSnapshot.docs.map((nodeDoc) =>
        mapTopicNode(
          nodeDoc.id,
          nodeDoc.data() as Record<string, unknown>,
        ),
      );
      callback(topicNodes);
    },
  ),

  subscribeNodeEvidence: (workspaceId, nodeId, callback) => onSnapshot(
    query(evidenceCollection(workspaceId, nodeId)),
    (snapshot) => {
      callback(snapshot.docs.map((evidenceDoc) =>
        mapEvidence(evidenceDoc.id, evidenceDoc.data() as Record<string, unknown>),
      ));
    },
  ),

  subscribeInputProgress: (workspaceId, inputId, callback) => onSnapshot(
    inputProgressDoc(workspaceId, inputId),
    (snapshot) => {
      callback(readInputProgress(
        workspaceId,
        inputId,
        snapshot.exists() ? snapshot.data() as Record<string, unknown> : undefined,
      ));
    },
  ),

  subscribeTopicActivity: (workspaceId, callback) => onSnapshot(
    query(inputProgressCollection(workspaceId), orderBy("updatedAt", "desc")),
    (snapshot) => {
      callback(snapshot.docs
        .map((progressDoc) => readTopicActivity(
          workspaceId,
          progressDoc.id,
          progressDoc.data() as Record<string, unknown>,
        ))
        .filter((item): item is TopicActivityItem => item !== null));
    },
  ),

  subscribeOrganizeOps: (workspaceId, callback) => onSnapshot(
    query(organizeOpsCollection(workspaceId), orderBy("updatedAt", "desc")),
    (snapshot) => {
      callback(snapshot.docs.map((opDoc) => readReviewOp(
        workspaceId,
        opDoc.id,
        opDoc.data() as Record<string, unknown>,
      )));
    },
  ),

  renameNode: async (workspaceId, nodeId, newTitle) => {
    await updateDoc(workspaceNodeDoc(workspaceId, nodeId), {
      title: newTitle,
    });
  },

  updateNodeSummary: async (workspaceId, nodeId, contextSummary) => {
    await updateDoc(workspaceNodeDoc(workspaceId, nodeId), {
      contextSummary,
    });
  },

  deleteNode: async (workspaceId, nodeId) => {
    await deleteDoc(workspaceNodeDoc(workspaceId, nodeId));
  },

  moveNode: async (workspaceId, nodeId, newParentId) => {
    await updateDoc(workspaceNodeDoc(workspaceId, nodeId), {
      parentId: newParentId ?? null,
    });
  },

  uploadInput: async (workspaceId, file) => {
    const { getFirebaseIdToken } = await import("@/services/firebase/token");
    const token = await getFirebaseIdToken();
    if (!token) {
      throw new Error("Sign in required before uploading files");
    }

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

    const json = (await res.json()) as { input_id: string; topic_id?: string };
    return {
      inputId: json.input_id,
      topicId: typeof json.topic_id === "string" && json.topic_id.trim() ? json.topic_id : `topic:${json.input_id}`,
    };
  },
};
