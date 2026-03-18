"use client";

import React, { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import { useRunContextStore } from '@/features/context/store/run-context-store';
import { workspaceService, type WorkspaceData } from '@/features/workspace/services/workspace-service';
import { CreateWorkspaceControl } from '@/features/workspace/components/CreateWorkspaceControl';
import { AddMemberControl } from '@/features/workspace/components/AddMemberControl';
import { FolderKanban, LayoutGrid } from 'lucide-react';
import { toast } from 'sonner';
import { UserAvatar } from './UserAvatar';

export function FloatingHeader() {
    const { workspaceId } = useRunContextStore();
    const [workspace, setWorkspace] = useState<WorkspaceData | null>(null);
    const [isEditing, setIsEditing] = useState(false);
    const [editName, setEditName] = useState("");
    const inputRef = useRef<HTMLInputElement>(null);

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

                {/* Workspace Name & Actions */}
                <div className="flex items-center gap-1.5 bg-background/95 backdrop-blur-sm border shadow-sm rounded-xl px-2 h-10">
                    <div className="flex items-center gap-2 px-2 group">
                        <FolderKanban className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />

                        {isEditing ? (
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
                                onClick={handleEditClick}
                                className="text-sm font-medium truncate max-w-[150px] cursor-text hover:bg-muted px-1 -ml-1 rounded transition-colors text-foreground"
                                title="Click to rename"
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
                    <CreateWorkspaceControl />
                    <AddMemberControl workspaceId={workspaceId} />
                </div>
            </div>
        </div>
    );
}
