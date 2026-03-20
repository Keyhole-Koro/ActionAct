"use client";

import { doc, onSnapshot, type DocumentData } from "firebase/firestore";

import { config } from "@/lib/config";
import { firestore } from "@/services/firebase/firestore";
import { getFirebaseIdToken } from "@/services/firebase/token";

export type WorkspaceDiscordIntegration = {
  enabled: boolean;
  guildId: string;
  guildName: string;
  installedBy?: string;
  botJoined: boolean;
  status: "pending" | "active" | "error";
  updatedAt?: number;
};

export type DiscordInstallCandidate = {
  guildId: string;
  guildName: string;
  source: string;
  joinedAt?: number;
};

export type DiscordInstallSession = {
  sessionId: string;
  workspaceId: string;
  status: "pending" | "awaiting_confirmation" | "completed" | "expired";
  selectedGuildId?: string;
  inviteUrl?: string;
  expiresAt?: number;
  candidates: DiscordInstallCandidate[];
};

function integrationDoc(workspaceId: string) {
  return doc(firestore, `workspaces/${workspaceId}/integrations/discord`);
}

function toIntegration(data: DocumentData): WorkspaceDiscordIntegration {
  const updatedAt = data.updatedAt && typeof data.updatedAt.toMillis === "function"
    ? data.updatedAt.toMillis()
    : undefined;

  return {
    enabled: data.enabled === true,
    guildId: typeof data.guildId === "string" ? data.guildId : "",
    guildName: typeof data.guildName === "string" ? data.guildName : "",
    installedBy: typeof data.installedBy === "string" ? data.installedBy : undefined,
    botJoined: data.botJoined === true,
    status: data.status === "pending" || data.status === "error" ? data.status : "active",
    updatedAt,
  };
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function normalizeSession(raw: unknown): DiscordInstallSession {
  const data = (raw && typeof raw === "object") ? (raw as Record<string, unknown>) : {};
  const candidatesRaw = Array.isArray(data.candidates) ? data.candidates : [];

  const candidates: DiscordInstallCandidate[] = candidatesRaw
    .map((candidate): DiscordInstallCandidate | null => {
      if (!candidate || typeof candidate !== "object") {
        return null;
      }
      const c = candidate as Record<string, unknown>;
      const guildId = asString(c.guildId) ?? asString(c.guild_id) ?? "";
      const guildName = asString(c.guildName) ?? asString(c.guild_name) ?? "";
      const source = asString(c.source) ?? "";
      const joinedAt = asNumber(c.joinedAt) ?? asNumber(c.joined_at);
      return joinedAt === undefined
        ? { guildId, guildName, source }
        : { guildId, guildName, source, joinedAt };
    })
    .filter((candidate): candidate is DiscordInstallCandidate => candidate !== null);

  return {
    sessionId: asString(data.sessionId) ?? asString(data.session_id) ?? "",
    workspaceId: asString(data.workspaceId) ?? asString(data.workspace_id) ?? "",
    status: (asString(data.status) as DiscordInstallSession["status"]) ?? "pending",
    selectedGuildId: asString(data.selectedGuildId) ?? asString(data.selected_guild_id),
    inviteUrl: asString(data.inviteUrl) ?? asString(data.invite_url),
    expiresAt: asNumber(data.expiresAt) ?? asNumber(data.expires_at),
    candidates,
  };
}

async function postJSON<T>(path: string, body: object): Promise<T> {
  const idToken = await getFirebaseIdToken();
  if (!idToken) {
    throw new Error("authentication required");
  }

  const response = await fetch(`${config.actApiBaseUrl}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${idToken}`,
      "Content-Type": "application/json",
    },
    credentials: "include",
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `request failed: ${path}`);
  }

  return response.json() as Promise<T>;
}

export const workspaceDiscordService = {
  subscribeIntegration(workspaceId: string, callback: (integration: WorkspaceDiscordIntegration | null) => void) {
    return onSnapshot(
      integrationDoc(workspaceId),
      (snapshot) => {
        if (!snapshot.exists()) {
          callback(null);
          return;
        }
        callback(toIntegration(snapshot.data()));
      },
      (error) => {
        console.error("Discord integration subscription failed:", error);
      },
    );
  },

  async getInviteUrl(workspaceId: string): Promise<string> {
    const response = await postJSON<{ invite_url?: string; inviteUrl?: string }>("/api/workspace/discord/invite", {
      workspace_id: workspaceId,
    });
    const inviteUrl = response.inviteUrl ?? response.invite_url;
    if (!inviteUrl) {
      throw new Error("inviteUrl is missing in invite response");
    }
    return inviteUrl;
  },

  async createInstallSession(workspaceId: string): Promise<DiscordInstallSession> {
    const response = await postJSON<DiscordInstallSession>("/api/workspace/discord/install-session/create", {
      workspace_id: workspaceId,
    });
    return normalizeSession(response);
  },

  async getInstallSession(workspaceId: string, sessionId: string): Promise<DiscordInstallSession> {
    const response = await postJSON<DiscordInstallSession>("/api/workspace/discord/install-session/status", {
      workspace_id: workspaceId,
      session_id: sessionId,
    });
    return normalizeSession(response);
  },

  async confirmInstallSession(workspaceId: string, sessionId: string, guildId: string): Promise<void> {
    await postJSON("/api/workspace/discord/install-session/confirm", {
      workspace_id: workspaceId,
      session_id: sessionId,
      guild_id: guildId,
    });
  },

  async connectGuild(workspaceId: string, guildId: string, guildName: string): Promise<void> {
    await postJSON("/api/workspace/discord/connect", {
      workspace_id: workspaceId,
      guild_id: guildId.trim(),
      guild_name: guildName.trim(),
    });
  },
};
