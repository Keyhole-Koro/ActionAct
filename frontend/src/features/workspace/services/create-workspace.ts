"use client";

import { doc, serverTimestamp, writeBatch } from "firebase/firestore";

import { firestore } from "@/services/firebase/firestore";

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function buildId(prefix: string, label: string): string {
  const base = slugify(label) || prefix;
  return `${prefix}-${base}-${crypto.randomUUID().slice(0, 8)}`;
}

type CreateWorkspaceInput = {
  uid: string;
  email?: string | null;
  displayName?: string | null;
  workspaceName?: string;
  topicName?: string;
};

type CreateWorkspaceResult = {
  workspaceId: string;
  topicId: string;
};

export async function createWorkspace(input: CreateWorkspaceInput): Promise<CreateWorkspaceResult> {
  const workspaceId = "ws-" + crypto.randomUUID();
  const topicLabel = input.topicName?.trim() || "topic-1";
  const topicId = buildId("topic", topicLabel);

  const batch = writeBatch(firestore);

  batch.set(
    doc(firestore, `workspaces/${workspaceId}`),
    {
      workspaceId,
      name: input.workspaceName?.trim() ?? "",
      createdBy: input.uid,
      status: "active",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );

  batch.set(
    doc(firestore, `workspaces/${workspaceId}/members/${input.uid}`),
    {
      uid: input.uid,
      email: input.email ?? null,
      displayName: input.displayName ?? null,
      role: "owner",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );

  batch.set(
    doc(firestore, `workspaces/${workspaceId}/topics/${topicId}`),
    {
      workspaceId,
      topicId,
      title: topicLabel,
      status: "active",
      latestDraftVersion: 0,
      latestOutlineVersion: 0,
      schemaVersion: 0,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );

  await batch.commit();

  return { workspaceId, topicId };
}
