"use client";

import { doc, serverTimestamp, setDoc } from "firebase/firestore";
import type { User } from "firebase/auth";

import { config } from "@/lib/config";
import { firestore } from "@/services/firebase/firestore";

export async function ensureLocalWorkspaceAccess(
  user: User,
  workspaceId: string,
  topicId: string,
): Promise<void> {
  if (!config.firestoreEmulatorHost) {
    return;
  }

  await setDoc(
    doc(firestore, `workspaces/${workspaceId}`),
    {
      workspaceId,
      name: workspaceId,
      status: "active",
      updatedAt: serverTimestamp(),
      createdAt: serverTimestamp(),
    },
    { merge: true },
  );

  await setDoc(
    doc(firestore, `workspaces/${workspaceId}/members/${user.uid}`),
    {
      uid: user.uid,
      email: user.email ?? null,
      displayName: user.displayName ?? null,
      updatedAt: serverTimestamp(),
      createdAt: serverTimestamp(),
    },
    { merge: true },
  );

  await setDoc(
    doc(firestore, `workspaces/${workspaceId}/topics/${topicId}`),
    {
      workspaceId,
      topicId,
      title: topicId,
      status: "active",
      updatedAt: serverTimestamp(),
      createdAt: serverTimestamp(),
    },
    { merge: true },
  );
}
