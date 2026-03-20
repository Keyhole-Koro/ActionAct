"use client";

import { useEffect, useState } from "react";
import { Bot, ExternalLink, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  workspaceDiscordService,
  type DiscordInstallSession,
  type WorkspaceDiscordIntegration,
} from "@/features/workspace/services/workspace-discord-service";

type DiscordConnectControlProps = {
  workspaceId: string;
};

function statusLabel(integration: WorkspaceDiscordIntegration | null): string {
  if (!integration || !integration.enabled) {
    return "Not connected";
  }
  if (integration.status === "pending") {
    return "Pending";
  }
  if (integration.status === "error") {
    return "Error";
  }
  return "Active";
}

export function DiscordConnectControl({ workspaceId }: DiscordConnectControlProps) {
  const [open, setOpen] = useState(false);
  const [integration, setIntegration] = useState<WorkspaceDiscordIntegration | null>(null);
  const [session, setSession] = useState<DiscordInstallSession | null>(null);
  const [loadingInvite, setLoadingInvite] = useState(false);
  const [confirmingGuildId, setConfirmingGuildId] = useState<string | null>(null);
  const [manualInviteUrl, setManualInviteUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!workspaceId) {
      return;
    }
    return workspaceDiscordService.subscribeIntegration(workspaceId, (next) => {
      setIntegration(next);
    });
  }, [workspaceId]);

  useEffect(() => {
    if (!open || !session?.sessionId) {
      return;
    }

    let cancelled = false;
    const poll = async () => {
      try {
        const next = await workspaceDiscordService.getInstallSession(workspaceId, session.sessionId);
        if (!cancelled) {
          setSession(next);
        }
      } catch (error) {
        if (!cancelled) {
          console.error("Failed to poll install session", error);
        }
      }
    };

    void poll();
    const timer = window.setInterval(() => {
      void poll();
    }, 2000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [open, session?.sessionId, workspaceId]);

  const handleOpenInvite = async () => {
    const popup = window.open("", "_blank", "noopener,noreferrer");
    if (popup && !popup.closed) {
      popup.document.title = "Opening Discord invite...";
      popup.document.body.innerHTML = "<p style='font-family: sans-serif; padding: 16px;'>Opening Discord invite...</p>";
    }
    setLoadingInvite(true);
    try {
      const nextSession = await workspaceDiscordService.createInstallSession(workspaceId);
      setSession(nextSession);
      if (nextSession.inviteUrl) {
        setManualInviteUrl(nextSession.inviteUrl);
        if (popup && !popup.closed) {
          popup.location.href = nextSession.inviteUrl;
        } else {
          toast.error("新規タブがブロックされました。下の Open Invite Link から開いてください");
        }
      } else {
        popup?.close();
        toast.error("inviteUrl を取得できませんでした");
      }
    } catch (error) {
      popup?.close();
      console.error("Failed to create Discord install session", error);
      toast.error("Discord install session の作成に失敗しました");
    } finally {
      setLoadingInvite(false);
    }
  };

  const handleConfirm = async (guildId: string) => {
    if (!session?.sessionId) {
      toast.error("install session がありません");
      return;
    }

    setConfirmingGuildId(guildId);
    try {
      await workspaceDiscordService.confirmInstallSession(workspaceId, session.sessionId, guildId);
      toast.success("Discord integration を保存しました");
      const next = await workspaceDiscordService.getInstallSession(workspaceId, session.sessionId);
      setSession(next);
    } catch (error) {
      console.error("Failed to confirm Discord install session", error);
      toast.error(error instanceof Error ? error.message : "Discord integration の保存に失敗しました");
    } finally {
      setConfirmingGuildId(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger className="inline-flex shrink-0 items-center justify-center border border-input bg-background hover:bg-accent hover:text-accent-foreground h-8 rounded-md px-3 text-xs font-medium gap-1.5 transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50">
        <Bot className="w-3.5 h-3.5" />
        DISCORD BOT
      </DialogTrigger>

      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Connect Discord</DialogTitle>
          <DialogDescription>
            bot を guild に招待してから、この workspace に紐付けます。
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between rounded-xl border border-border/70 bg-muted/20 px-4 py-3">
            <div className="text-sm">
              <div className="font-medium">Current Status</div>
              <div className="text-muted-foreground">
                {integration?.guildName ? `${integration.guildName} (${integration.guildId})` : "No guild connected"}
              </div>
            </div>
            <Badge variant="secondary">{statusLabel(integration)}</Badge>
          </div>

          <div className="rounded-xl border border-border/70 p-4">
            <div className="text-sm font-medium">1. Invite the bot</div>
            <p className="mt-1 text-xs text-muted-foreground">
              install session を作成して Discord OAuth ページを開きます。
            </p>
            <Button
              type="button"
              variant="secondary"
              className="mt-3 gap-2"
              onClick={() => void handleOpenInvite()}
              disabled={loadingInvite}
            >
              {loadingInvite ? <Loader2 className="h-4 w-4 animate-spin" /> : <ExternalLink className="h-4 w-4" />}
              Open Invite
            </Button>
            {manualInviteUrl ? (
              <Button
                type="button"
                variant="outline"
                className="mt-2 gap-2"
                onClick={() => {
                  window.open(manualInviteUrl, "_blank", "noopener,noreferrer");
                }}
              >
                <ExternalLink className="h-4 w-4" />
                Open Invite Link
              </Button>
            ) : null}
          </div>

          <div className="rounded-xl border border-border/70 p-4">
            <div className="text-sm font-medium">2. Confirm guild</div>
            <p className="mt-1 text-xs text-muted-foreground">
              bot が参加した guild 候補が出たら 1 回だけ確認します。
            </p>

            <div className="mt-3 flex flex-col gap-3">
              <div className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
                Session: {session?.sessionId ?? "not started"}
              </div>
              {!session ? (
                <div className="text-sm text-muted-foreground">Invite を開くと candidate 検出を開始します。</div>
              ) : session.candidates.length === 0 ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  guild candidate を待っています...
                </div>
              ) : (
                <ul className="flex flex-col gap-2">
                  {session.candidates.map((candidate) => (
                    <li key={candidate.guildId} className="flex items-center justify-between rounded-lg border border-border/60 px-3 py-3">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium">{candidate.guildName}</div>
                        <div className="truncate text-xs text-muted-foreground">{candidate.guildId}</div>
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => void handleConfirm(candidate.guildId)}
                        disabled={confirmingGuildId === candidate.guildId}
                      >
                        {confirmingGuildId === candidate.guildId ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                        Confirm
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
        <DialogFooter />
      </DialogContent>
    </Dialog>
  );
}
