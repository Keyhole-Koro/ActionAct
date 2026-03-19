"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Loader2, UserPlus } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  addWorkspaceMember,
  searchWorkspaceUsers,
  type WorkspaceMemberRole,
  type WorkspaceSearchUser,
} from "@/features/workspace/services/workspace-member-service";

type AddMemberControlProps = {
  workspaceId: string;
};

export function AddMemberControl({ workspaceId }: AddMemberControlProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [role, setRole] = useState<WorkspaceMemberRole>("editor");
  const [loading, setLoading] = useState(false);
  const [addingUid, setAddingUid] = useState<string | null>(null);
  const [didSearch, setDidSearch] = useState(false);
  const [results, setResults] = useState<WorkspaceSearchUser[]>([]);
  const searchSeq = useRef(0);

  const canSearch = useMemo(() => query.trim().length >= 2, [query]);

  useEffect(() => {
    if (!open) {
      return;
    }

    if (!canSearch) {
      setLoading(false);
      setResults([]);
      setDidSearch(false);
      return;
    }

    const currentSeq = ++searchSeq.current;
    const timer = window.setTimeout(async () => {
      setLoading(true);
      try {
        const users = await searchWorkspaceUsers(workspaceId, query.trim());
        if (searchSeq.current !== currentSeq) {
          return;
        }
        setResults(users);
        setDidSearch(true);
      } catch (error) {
        if (searchSeq.current !== currentSeq) {
          return;
        }
        console.error("Failed to search users", error);
        toast.error("ユーザー検索に失敗しました");
        setResults([]);
      } finally {
        if (searchSeq.current === currentSeq) {
          setLoading(false);
        }
      }
    }, 350);

    return () => {
      window.clearTimeout(timer);
    };
  }, [open, canSearch, query, workspaceId]);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setResults([]);
      setRole("editor");
      setLoading(false);
      setDidSearch(false);
      setAddingUid(null);
    }
  }, [open]);

  const handleAdd = async (user: WorkspaceSearchUser) => {
    setAddingUid(user.uid);
    try {
      await addWorkspaceMember(workspaceId, user.uid, role);
      toast.success("メンバーを追加しました");
    } catch (error) {
      console.error("Failed to add workspace member", error);
      toast.error("メンバー追加に失敗しました");
    } finally {
      setAddingUid(null);
    }
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger render={<Button variant="outline" size="sm" />}>
        <UserPlus className="w-3.5 h-3.5" />
        Share
      </SheetTrigger>

      <SheetContent side="right" className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Workspace Share</SheetTitle>
          <SheetDescription>
            アカウントを検索して、この workspace のメンバーに追加します。
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-col gap-4 px-4 pb-4">
          <div className="flex flex-col gap-2">
            <label className="text-xs font-medium text-muted-foreground">Role</label>
            <div className="inline-flex rounded-lg border border-border/70 p-1">
              <Button
                type="button"
                size="sm"
                variant={role === "editor" ? "secondary" : "ghost"}
                onClick={() => setRole("editor")}
              >
                Editor
              </Button>
              <Button
                type="button"
                size="sm"
                variant={role === "viewer" ? "secondary" : "ghost"}
                onClick={() => setRole("viewer")}
              >
                Viewer
              </Button>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-xs font-medium text-muted-foreground">Search User</label>
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="name / email / uid"
              autoFocus
            />
            <p className="text-xs text-muted-foreground">2文字以上入力すると自動検索します。</p>
          </div>

          <div className="min-h-56 rounded-xl border border-border/70 bg-muted/20">
            {loading ? (
              <div className="flex h-56 items-center justify-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Searching...
              </div>
            ) : !canSearch ? (
              <div className="flex h-56 items-center justify-center px-6 text-center text-sm text-muted-foreground">
                ユーザー名、メール、または UID を入力してください。
              </div>
            ) : didSearch && results.length === 0 ? (
              <div className="flex h-56 items-center justify-center px-6 text-center text-sm text-muted-foreground">
                一致するユーザーが見つかりませんでした。
              </div>
            ) : (
              <ul className="max-h-56 divide-y divide-border/60 overflow-auto">
                {results.map((user) => (
                  <li key={user.uid} className="flex items-center justify-between gap-3 px-3 py-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">{user.display_name || user.email || user.uid}</div>
                      <div className="truncate text-xs text-muted-foreground">{user.email || user.uid}</div>
                    </div>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => void handleAdd(user)}
                      disabled={addingUid === user.uid}
                    >
                      {addingUid === user.uid ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                      Add
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
