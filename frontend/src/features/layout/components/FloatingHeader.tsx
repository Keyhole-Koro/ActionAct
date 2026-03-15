"use client";

import React, { useEffect, useState, useRef } from 'react';
import { useRunContextStore } from '@/features/context/store/run-context-store';
import { workspaceService, type WorkspaceData } from '@/features/workspace/services/workspace-service';
import { CreateWorkspaceControl } from '@/features/workspace/components/CreateWorkspaceControl';
import { UploadButton } from '@/features/action/actionOrganize/components/UploadButton';
import { FolderKanban, Sparkles } from 'lucide-react';
import { config } from '@/lib/config';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

export function FloatingHeader() {
    const isMock = config.useMocks;
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
                {/* Brand Logo / Home indicator */}
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary/80 to-primary/40 flex items-center justify-center shadow-md backdrop-blur-sm cursor-default">
                    <Sparkles className="w-5 h-5 text-white" />
                </div>

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

                    {!isMock && <CreateWorkspaceControl />}
                    <UploadButton compact />
                </div>
            </div>

            {isMock && (
                <div className="ml-12">
                    <Badge variant="secondary" className="bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 hover:bg-amber-100 border-0 font-semibold tracking-wide shadow-sm">
                        Mock Mode
                    </Badge>
                </div>
            )}
        </div>
    );
}
