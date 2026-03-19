"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { FolderKanban, Plus, ArrowRight, Globe, Clock, Database, FileText } from "lucide-react";

import { LoginButton } from "@/features/auth/components/LoginButton";
import { useRequireAuth } from "@/features/auth/hooks/useRequireAuth";
import { UserAvatar } from "@/features/layout/components/UserAvatar";
import { createWorkspace } from "@/features/workspace/services/create-workspace";
import { listUserWorkspaces } from "@/features/workspace/services/list-workspaces";
import { listPublicWorkspaces } from "@/features/workspace/services/list-public-workspaces";
import { type WorkspaceData } from "@/features/workspace/services/workspace-service";

function formatRelativeTime(millis?: number): string {
    if (!millis) return "Never";
    const diff = Date.now() - millis;
    const mins = Math.floor(diff / 60000);
    const hours = Math.floor(mins / 60);
    const days = Math.floor(hours / 24);

    if (mins < 1) return "Just now";
    if (mins < 60) return `${mins}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return `${days}d ago`;
}

function WorkspaceGrid({
    workspaces,
    onSelect,
    showPublicBadge = false,
}: {
    workspaces: WorkspaceData[];
    onSelect: (ws: WorkspaceData) => void;
    showPublicBadge?: boolean;
}) {
    return (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {workspaces.map((ws) => (
                <button
                    key={ws.id}
                    onClick={() => onSelect(ws)}
                    className="group flex flex-col rounded-xl border bg-card p-5 text-left hover:border-primary/40 hover:shadow-md transition-all duration-300"
                >
                    <div className="flex items-start justify-between mb-4">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
                            <FolderKanban className="h-5 w-5 text-primary" />
                        </div>
                        {showPublicBadge && (
                            <div className="flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                                <Globe className="h-3 w-3" />
                                Public
                            </div>
                        )}
                    </div>

                    <div className="mb-3">
                        <h3 className="font-semibold text-base line-clamp-1">{ws.name}</h3>
                        <p className="text-[10px] text-muted-foreground font-mono mt-0.5 opacity-60">
                            {ws.id}
                        </p>
                    </div>

                    {/* Preview Text */}
                    <div className="mb-5 flex-1">
                        {ws.latestNodeSummary ? (
                            <div className="flex gap-2">
                                <FileText className="h-3 w-3 mt-0.5 shrink-0 text-muted-foreground/50" />
                                <p className="text-xs text-muted-foreground line-clamp-2 italic leading-relaxed">
                                    "{ws.latestNodeSummary}"
                                </p>
                            </div>
                        ) : (
                            <p className="text-xs text-muted-foreground/40 italic">
                                No activity recorded yet.
                            </p>
                        )}
                    </div>

                    {/* Stats Footer */}
                    <div className="flex items-center justify-between border-t pt-4 mt-auto">
                        <div className="flex items-center gap-3">
                            <div className="flex items-center gap-1 text-[11px] text-muted-foreground font-medium">
                                <Database className="h-3 w-3 opacity-70" />
                                {ws.nodeCount ?? 0}
                            </div>
                            <div className="flex items-center gap-1 text-[11px] text-muted-foreground font-medium">
                                <Clock className="h-3 w-3 opacity-70" />
                                {formatRelativeTime(ws.updatedAt)}
                            </div>
                        </div>
                        <ArrowRight className="h-4 w-4 text-primary opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-300" />
                    </div>
                </button>
            ))}
        </div>
    );
}

export default function DashboardPage() {
    const { user, loading, isAuthenticated } = useRequireAuth();
    const router = useRouter();
    const searchParams = useSearchParams();
    const usePersistedGraphMock = searchParams.get('graphMock') === '1';
    const [workspaces, setWorkspaces] = useState<WorkspaceData[]>([]);
    const [sharedWorkspaces, setSharedWorkspaces] = useState<WorkspaceData[]>([]);
    const [publicWorkspaces, setPublicWorkspaces] = useState<WorkspaceData[]>([]);
    const [loadingWorkspaces, setLoadingWorkspaces] = useState(false);
    const [loadingPublic, setLoadingPublic] = useState(false);
    const [creating, setCreating] = useState(false);

    useEffect(() => {
        if (!user) return;
        setLoadingWorkspaces(true);
        listUserWorkspaces(user.uid)
            .then((all) => {
                const owned = all.filter((ws) => ws.createdBy === user.uid);
                const shared = all.filter((ws) => ws.createdBy !== user.uid);
                setWorkspaces(owned);
                setSharedWorkspaces(shared);
            })
            .catch(console.error)
            .finally(() => setLoadingWorkspaces(false));

        setLoadingPublic(true);
        listPublicWorkspaces()
            .then((all) => {
                // Exclude workspaces the user is already a member of (shown in My Workspaces)
                setPublicWorkspaces(all);
            })
            .catch(console.error)
            .finally(() => setLoadingPublic(false));
    }, [user]);

    const handleSelect = (ws: WorkspaceData) => {
        router.push(`/workspace/${ws.id}`);
    };

    const handleCreate = async () => {
        if (!user || creating) return;
        setCreating(true);
        try {
            const result = await createWorkspace({
                uid: user.uid,
                email: user.email,
                displayName: user.displayName,
            });
            router.push(`/workspace/${result.workspaceId}`);
        } catch (error) {
            console.error("Failed to create workspace", error);
            setCreating(false);
        }
    };

    if (loading) {
        return (
            <div className="flex h-screen w-full items-center justify-center text-sm text-muted-foreground">
                Loading...
            </div>
        );
    }

    if (!isAuthenticated) {
        return (
            <div className="flex h-screen w-full items-center justify-center">
                <div className="flex max-w-sm flex-col items-center gap-4 rounded-lg border bg-background p-6 text-center">
                    <h2 className="text-lg font-semibold">Sign in to use Act</h2>
                    <LoginButton />
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-background">
            <header className="border-b bg-background/95 backdrop-blur-sm sticky top-0 z-10">
                <div className="mx-auto max-w-4xl px-6 h-14 flex items-center justify-between">
                    <span className="text-base font-semibold tracking-tight">Act</span>
                    <UserAvatar
                        className="h-8 w-8 rounded-full"
                        dropdownSide="bottom"
                        dropdownAlign="end"
                    />
                </div>
            </header>
            <div className="mx-auto max-w-4xl px-6 py-12">
                <div className="mb-8 flex items-center justify-between">
                    <div>
                        <h1 className="text-2xl font-semibold">Workspaces</h1>
                        <p className="mt-1 text-sm text-muted-foreground">
                            Select a workspace to open
                        </p>
                    </div>
                    {!usePersistedGraphMock && (
                        <button
                            onClick={() => void handleCreate()}
                            disabled={creating}
                            className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
                        >
                            <Plus className="h-4 w-4" />
                            {creating ? "Creating..." : "New Workspace"}
                        </button>
                    )}
                </div>

                <div className="space-y-12">
                    {/* Owned Workspaces */}
                    <section>
                        <div className="mb-4">
                            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">My Workspaces</h2>
                        </div>
                        {loadingWorkspaces ? (
                            <div className="text-sm text-muted-foreground">Loading workspaces...</div>
                        ) : workspaces.length === 0 ? (
                            <div className="flex flex-col items-center gap-4 rounded-lg border border-dashed p-12 text-center">
                                <FolderKanban className="h-10 w-10 text-muted-foreground" />
                                <div>
                                    <p className="font-medium text-sm">No workspaces yet</p>
                                    <p className="mt-1 text-xs text-muted-foreground">
                                        Create your first workspace to get started
                                    </p>
                                </div>
                            </div>
                        ) : (
                            <WorkspaceGrid workspaces={workspaces} onSelect={handleSelect} />
                        )}
                    </section>

                    {/* Shared Workspaces */}
                    {sharedWorkspaces.length > 0 && (
                        <section>
                            <div className="mb-4">
                                <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Shared with me</h2>
                            </div>
                            <WorkspaceGrid workspaces={sharedWorkspaces} onSelect={handleSelect} />
                        </section>
                    )}

                    {/* Public Workspaces */}
                    <section>
                        <div className="mb-4 flex items-center gap-2">
                            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Public Explore</h2>
                            <Globe className="h-3.5 w-3.5 text-muted-foreground" />
                        </div>
                        {loadingPublic ? (
                            <div className="text-sm text-muted-foreground">Loading public workspaces...</div>
                        ) : publicWorkspaces.length === 0 ? (
                            <p className="text-sm text-muted-foreground">No public workspaces available.</p>
                        ) : (
                            <WorkspaceGrid workspaces={publicWorkspaces} onSelect={handleSelect} showPublicBadge />
                        )}
                    </section>
                </div>
            </div>
        </div>
    );
}
