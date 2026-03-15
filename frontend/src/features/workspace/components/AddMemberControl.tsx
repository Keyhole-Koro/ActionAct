"use client";

import { useMemo, useState } from "react";
import { UserPlus, X, Search } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  const [results, setResults] = useState<WorkspaceSearchUser[]>([]);

  const canSearch = useMemo(() => query.trim().length >= 2, [query]);

  const reset = () => {
    setOpen(false);
    setQuery("");
    setResults([]);
    setRole("editor");
    setLoading(false);
    setAddingUid(null);
  };

  const handleSearch = async () => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      toast.error("2文字以上で検索してください");
      return;
    }

    setLoading(true);
    try {
      const users = await searchWorkspaceUsers(workspaceId, trimmed);
      setResults(users);
      if (users.length === 0) {
        toast.message("一致するユーザーが見つかりません");
      }
    } catch (error) {
      console.error("Failed to search users", error);
      toast.error("ユーザー検索に失敗しました");
    } finally {
      setLoading(false);
    }
  };

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

  if (!open) {
    return (
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <UserPlus className="w-3.5 h-3.5" />
        Share
      </Button>
    );
  }

  return (
    <div className="flex items-start gap-2 rounded-xl border border-border/60 bg-background/95 px-2 py-2 shadow-lg">
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="name / email / uid"
            className="w-52"
            disabled={loading}
          />
          <select
            value={role}
            onChange={(event) => setRole(event.target.value as WorkspaceMemberRole)}
            className="h-9 rounded-md border border-input bg-background px-2 text-sm"
            disabled={loading}
          >
            <option value="editor">editor</option>
            <option value="viewer">viewer</option>
          </select>
          <Button size="sm" onClick={() => void handleSearch()} disabled={loading || !canSearch}>
            <Search className="w-3.5 h-3.5" />
            Search
          </Button>
        </div>

        <div className="max-h-36 overflow-auto rounded-md border border-border/60 bg-background/70">
          {results.length === 0 ? (
            <div className="px-3 py-2 text-xs text-muted-foreground">検索結果がここに表示されます</div>
          ) : (
            <ul className="divide-y divide-border/60">
              {results.map((user) => (
                <li key={user.uid} className="flex items-center justify-between gap-3 px-3 py-2 text-xs">
                  <div className="min-w-0">
                    <div className="truncate font-medium">{user.display_name || user.email || user.uid}</div>
                    <div className="truncate text-muted-foreground">{user.email || user.uid}</div>
                  </div>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => void handleAdd(user)}
                    disabled={addingUid === user.uid}
                  >
                    Add
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <Button variant="ghost" size="icon-sm" onClick={reset} disabled={loading || addingUid !== null}>
        <X className="w-3.5 h-3.5" />
      </Button>
    </div>
  );
}
