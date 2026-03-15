import { config } from "@/lib/config";
import { getFirebaseIdToken } from "@/services/firebase/token";

export type WorkspaceSearchUser = {
  uid: string;
  email?: string;
  display_name?: string;
};

export type WorkspaceMemberRole = "editor" | "viewer";

async function getAuthHeader(): Promise<string> {
  const idToken = await getFirebaseIdToken();
  if (!idToken) {
    throw new Error("authentication required");
  }
  return `Bearer ${idToken}`;
}

export async function searchWorkspaceUsers(workspaceId: string, query: string): Promise<WorkspaceSearchUser[]> {
  const authHeader = await getAuthHeader();

  const response = await fetch(`${config.actApiBaseUrl}/api/workspace/members/search`, {
    method: "POST",
    headers: {
      Authorization: authHeader,
      "Content-Type": "application/json",
    },
    credentials: "include",
    body: JSON.stringify({
      workspace_id: workspaceId,
      query,
      limit: 20,
    }),
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || "failed to search users");
  }

  const payload = (await response.json()) as { users?: WorkspaceSearchUser[] };
  return payload.users ?? [];
}

export async function addWorkspaceMember(workspaceId: string, userId: string, role: WorkspaceMemberRole): Promise<void> {
  const authHeader = await getAuthHeader();

  const response = await fetch(`${config.actApiBaseUrl}/api/workspace/members/add`, {
    method: "POST",
    headers: {
      Authorization: authHeader,
      "Content-Type": "application/json",
    },
    credentials: "include",
    body: JSON.stringify({
      workspace_id: workspaceId,
      user_id: userId,
      role,
    }),
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || "failed to add workspace member");
  }
}
