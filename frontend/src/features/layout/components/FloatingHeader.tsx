"use client";

import React, { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useRunContextStore } from '@/features/context/store/run-context-store';
import { workspaceService, type WorkspaceData } from '@/features/workspace/services/workspace-service';
import { AddMemberControl } from '@/features/workspace/components/AddMemberControl';
import { DiscordConnectControl } from '@/features/workspace/components/DiscordConnectControl';
import { FolderKanban, LayoutGrid, Globe, Lock } from 'lucide-react';
import { toast } from 'sonner';
import { UserAvatar } from './UserAvatar';
import { PresenceAvatars } from './PresenceAvatars';
import { useAuthState } from '@/features/auth/hooks/useAuthState';
import { usePresence } from '@/features/layout/hooks/usePresence';

export function FloatingHeader() {
    const { workspaceId, isReadOnly } = useRunContextStore();
    const { user } = useAuthState();
    const searchParams = useSearchParams();
    const usePersistedGraphMock = searchParams.get('graphMock') === '1';
    const [workspace, setWorkspace] = useState<WorkspaceData | null>(null);
    const [isEditing, setIsEditing] = useState(false);
    const [editName, setEditName] = useState("");
    const [updatingVisibility, setUpdatingVisibility] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);

    const isOwner = !!user && !!workspace?.createdBy && workspace.createdBy === user.uid;

    // Presence: 自分のオンライン状態を書き込む
    usePresence(workspaceId, user?.uid, user?.displayName, user?.photoURL);

    // Subscribe to workspace changes
    useEffect(() => {
        if (!workspaceId) return;

        const unsubscribe = workspaceService.subscribeWorkspace(workspaceId, (data) => {
            setWorkspace(data);
            if (!isEditing) {
                setEditName(data?.name ?? workspaceId);
            }
        });

        return () => unsubscribe();
    }, [workspaceId, isEditing]);

    // Handle turning on edit mode
    const handleEditClick = () => {
        setIsEditing(true);
        setEditName(workspace?.name ?? workspaceId);
        // Focus the input in the next tick
        setTimeout(() => inputRef.current?.focus(), 0);
    };

    // Handle saving the new name
    const handleSave = async () => {
        if (!isEditing) return;
        setIsEditing(false);

        const trimmed = editName.trim();
        if (!trimmed || trimmed === (workspace?.name ?? workspaceId)) {
            // Revert changes visually
            setEditName(workspace?.name ?? workspaceId);
            return;
        }

        try {
            await workspaceService.updateWorkspaceName(workspaceId, trimmed);
            toast.success("Workspace renamed");
        } catch (error) {
            console.error("Failed to rename workspace", error);
            toast.error("Failed to rename workspace");
            setEditName(workspace?.name ?? workspaceId);
        }
    };

    const handleToggleVisibility = async () => {
        if (!workspace || updatingVisibility || !isOwner) return;
        const newVisibility = workspace.visibility === 'public' ? 'private' : 'public';
        setUpdatingVisibility(true);
        try {
            await workspaceService.updateVisibility(workspaceId, newVisibility);
            toast.success(`Workspace is now ${newVisibility}`);
        } catch (error) {
            console.error("Failed to update visibility", error);
            toast.error("Failed to update visibility");
        } finally {
            setUpdatingVisibility(false);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            void handleSave();
        } else if (e.key === 'Escape') {
            e.preventDefault();
            setIsEditing(false);
            setEditName(workspace?.name ?? workspaceId);
        }
    };

    return (
        <div className="absolute top-4 left-4 z-20 flex flex-col gap-2">
            <div className="flex items-center gap-2">
                {/* Account Avatar */}
                <UserAvatar className="h-10 w-10 rounded-xl shadow-md backdrop-blur-sm" />

                {/* 他のオンラインユーザー */}
                {workspaceId && <PresenceAvatars workspaceId={workspaceId} currentUid={user?.uid} />}

                {/* Workspace Name & Actions */}
                <div className="flex items-center gap-1.5 bg-background/95 backdrop-blur-sm border shadow-sm rounded-xl px-2 h-10">
                    <div className="flex items-center gap-2 px-2 group">
                        <FolderKanban className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />

                        {!isReadOnly && isEditing ? (
                            <input
                                ref={inputRef}
                                value={editName}
                                onChange={(e) => setEditName(e.target.value)}
                                onBlur={() => void handleSave()}
                                onKeyDown={handleKeyDown}
                                className="bg-transparent border-none outline-none h-6 text-sm font-medium w-40 text-foreground ring-0 p-0"
                                placeholder="Workspace name"
                            />
                        ) : (
                            <span
                                onClick={isReadOnly ? undefined : handleEditClick}
                                className={`text-sm font-medium truncate max-w-[150px] px-1 -ml-1 rounded transition-colors text-foreground ${isReadOnly ? '' : 'cursor-text hover:bg-muted'}`}
                                title={isReadOnly ? workspace?.name ?? workspaceId : "Click to rename"}
                            >
                                {workspace?.name ?? workspaceId}
                            </span>
                        )}
                    </div>

                    <div className="h-5 w-px bg-border/60 mx-1" />

                    <Link
                        href="/dashboard"
                        className="flex h-7 w-7 items-center justify-center rounded-md hover:bg-accent transition-colors"
                        title="All workspaces"
                    >
                        <LayoutGrid className="h-3.5 w-3.5 text-muted-foreground" />
                    </Link>
                    {!isReadOnly && !usePersistedGraphMock && (
                        <>
                            {isOwner && (
                                <button
                                    type="button"
                                    onClick={() => void handleToggleVisibility()}
                                    disabled={updatingVisibility}
                                    className="flex h-7 px-2 items-center gap-1.5 rounded-md hover:bg-accent transition-colors disabled:opacity-50"
                                    title={workspace?.visibility === 'public' ? 'Make private' : 'Make public'}
                                >
                                    {workspace?.visibility === 'public'
                                        ? (
                                            <>
                                                <Globe className="h-3.5 w-3.5 text-primary" />
                                                <span className="text-xs font-medium text-primary">Public</span>
                                            </>
                                        )
                                        : (
                                            <>
                                                <Lock className="h-3.5 w-3.5 text-muted-foreground" />
                                                <span className="text-xs font-medium text-muted-foreground">Private</span>
                                            </>
                                        )
                                    }
                                </button>
                            )}
                            {isOwner && <DiscordConnectControl workspaceId={workspaceId} />}
                            {isOwner && <AddMemberControl workspaceId={workspaceId} />}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
