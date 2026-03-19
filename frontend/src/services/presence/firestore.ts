import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";

import { firestore } from "@/services/firebase/firestore";

const PRESENCE_STALE_MS = 60_000; // 60秒以内にlastSeenがあればオンライン

export interface PresenceUser {
  uid: string;
  displayName: string | null;
  photoURL: string | null;
  lastSeen: number; // Date.now() ms
  cursor?: { x: number; y: number }; // ReactFlow flow coordinates
}

function presenceCollection(workspaceId: string) {
  return collection(firestore, `workspaces/${workspaceId}/presence`);
}

function presenceDoc(workspaceId: string, uid: string) {
  return doc(firestore, `workspaces/${workspaceId}/presence/${uid}`);
}

export const presenceService = {
  async writePresence(
    workspaceId: string,
    uid: string,
    displayName: string | null,
    photoURL: string | null,
  ) {
    await setDoc(presenceDoc(workspaceId, uid), {
      uid,
      displayName: displayName ?? null,
      photoURL: photoURL ?? null,
      lastSeen: serverTimestamp(),
    });
  },

  async removePresence(workspaceId: string, uid: string) {
    await deleteDoc(presenceDoc(workspaceId, uid));
  },

  writeCursor(workspaceId: string, uid: string, x: number, y: number): void {
    updateDoc(presenceDoc(workspaceId, uid), { cursor: { x, y } }).catch(() => {});
  },

  subscribePresence(
    workspaceId: string,
    callback: (users: PresenceUser[]) => void,
  ): () => void {
    return onSnapshot(presenceCollection(workspaceId), (snapshot) => {
      const now = Date.now();
      const users: PresenceUser[] = [];

      snapshot.docs.forEach((d) => {
        const data = d.data();
        const lastSeenTs = data.lastSeen;
        if (!lastSeenTs || typeof lastSeenTs.toMillis !== "function") return;

        const lastSeenMs = lastSeenTs.toMillis() as number;
        if (now - lastSeenMs > PRESENCE_STALE_MS) return;

        const cursorData = data.cursor;
        const cursor = cursorData
          && typeof cursorData.x === 'number'
          && typeof cursorData.y === 'number'
          ? { x: cursorData.x as number, y: cursorData.y as number }
          : undefined;

        users.push({
          uid: d.id,
          displayName: typeof data.displayName === "string" ? data.displayName : null,
          photoURL: typeof data.photoURL === "string" ? data.photoURL : null,
          lastSeen: lastSeenMs,
          cursor,
        });
      });

      callback(users);
    });
  },
};
