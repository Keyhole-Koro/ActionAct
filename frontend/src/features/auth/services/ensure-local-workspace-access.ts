"use client";

import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
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

  const workspaceRef = doc(firestore, `workspaces/${workspaceId}`);
  const workspaceSnapshot = await getDoc(workspaceRef);
  const currentName = workspaceSnapshot.exists() ? workspaceSnapshot.data()?.name : undefined;
  // Only set name if not already present in the document (preserve empty string)
  const hasName = typeof currentName === "string";

  await setDoc(
    workspaceRef,
    {
      workspaceId,
      ...(hasName ? {} : { name: "" }),
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
      role: "owner",
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
