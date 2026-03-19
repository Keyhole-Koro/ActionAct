"use client";

import React, { useEffect, useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { presenceService, type PresenceUser } from "@/services/presence/firestore";

interface PresenceAvatarsProps {
  workspaceId: string;
  currentUid: string | undefined;
}

export function PresenceAvatars({ workspaceId, currentUid }: PresenceAvatarsProps) {
  const [users, setUsers] = useState<PresenceUser[]>([]);

  useEffect(() => {
    if (!workspaceId) return;
    return presenceService.subscribePresence(workspaceId, setUsers);
  }, [workspaceId]);

  // 自分以外のオンラインユーザー（最大5人）
  const others = users
    .filter((u) => u.uid !== currentUid)
    .slice(0, 5);

  if (others.length === 0) return null;

  return (
    <div className="flex items-center">
      <div className="flex -space-x-2">
        {others.map((u) => {
          const initial = (u.displayName?.trim().charAt(0) ?? "?").toUpperCase();
          return (
            <div key={u.uid} className="relative group">
              <Avatar className="h-7 w-7 border-2 border-background shadow-sm ring-1 ring-primary/20 transition-transform group-hover:scale-110 group-hover:z-10">
                <AvatarImage src={u.photoURL ?? undefined} alt={u.displayName ?? "User"} />
                <AvatarFallback className="bg-gradient-to-br from-primary/20 to-primary/10 text-[10px] font-bold text-primary">
                  {initial}
                </AvatarFallback>
              </Avatar>
              {/* Tooltip */}
              <div className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 hidden group-hover:block z-50">
                <div className="rounded-md bg-popover border border-border/50 shadow-md px-2 py-1 text-[11px] font-medium text-popover-foreground whitespace-nowrap">
                  {u.displayName ?? "Anonymous"}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      {/* オンライン数インジケーター */}
      <span className="ml-2 text-[10px] text-muted-foreground font-medium">
        {others.length === 1 ? "1 online" : `${others.length} online`}
      </span>
    </div>
  );
}
