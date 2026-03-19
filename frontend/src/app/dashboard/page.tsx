"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { FolderKanban, Plus, ArrowRight, Globe } from "lucide-react";

import { LoginButton } from "@/features/auth/components/LoginButton";
import { useRequireAuth } from "@/features/auth/hooks/useRequireAuth";
import { UserAvatar } from "@/features/layout/components/UserAvatar";
import { createWorkspace } from "@/features/workspace/services/create-workspace";
import { listUserWorkspaces } from "@/features/workspace/services/list-workspaces";
import { listPublicWorkspaces } from "@/features/workspace/services/list-public-workspaces";
import { type WorkspaceData } from "@/features/workspace/services/workspace-service";

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
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {workspaces.map((ws) => (
                <button
                    key={ws.id}
                    onClick={() => onSelect(ws)}
                    className="group flex items-center justify-between rounded-lg border bg-card p-4 text-left hover:border-primary/50 hover:bg-accent transition-colors"
                >
                    <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
                            <FolderKanban className="h-4 w-4 text-primary" />
                        </div>
                        <div>
                            <div className="flex items-center gap-1.5">
                                <p className="text-sm font-medium">{ws.name}</p>
                                {showPublicBadge && (
                                    <Globe className="h-3 w-3 text-muted-foreground" />
                                )}
                            </div>
                            <p className="text-xs text-muted-foreground font-mono truncate max-w-[130px]">
                                {ws.id}
                            </p>
                        </div>
                    </div>
                    <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
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
    const [publicWorkspaces, setPublicWorkspaces] = useState<WorkspaceData[]>([]);
    const [loadingWorkspaces, setLoadingWorkspaces] = useState(false);
    const [loadingPublic, setLoadingPublic] = useState(false);

    useEffect(() => {
        if (!user) return;
        setLoadingWorkspaces(true);
        listUserWorkspaces(user.uid)
            .then(setWorkspaces)
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
                </div>

                {loadingWorkspaces ? (
                    <div className="text-sm text-muted-foreground">Loading workspaces...</div>
                ) : workspaces.length === 0 ? (
                    <div className="flex flex-col items-center gap-4 rounded-lg border border-dashed p-12 text-center">
                        <FolderKanban className="h-10 w-10 text-muted-foreground" />
                        <div>
                            <p className="font-medium">No workspaces yet</p>
                            <p className="mt-1 text-sm text-muted-foreground">
                                Create your first workspace to get started
                            </p>
                        </div>
                    </div>
                ) : (
                    <WorkspaceGrid workspaces={workspaces} onSelect={handleSelect} />
                )}

                {/* Public Workspaces */}
                <div className="mt-10">
                    <div className="mb-4 flex items-center gap-2">
                        <Globe className="h-4 w-4 text-muted-foreground" />
                        <h2 className="text-base font-semibold">Public Workspaces</h2>
                    </div>
                    {loadingPublic ? (
                        <div className="text-sm text-muted-foreground">Loading public workspaces...</div>
                    ) : publicWorkspaces.length === 0 ? (
                        <p className="text-sm text-muted-foreground">No public workspaces available.</p>
                    ) : (
                        <WorkspaceGrid workspaces={publicWorkspaces} onSelect={handleSelect} showPublicBadge />
                    )}
                </div>
            </div>
        </div>
    );
}
