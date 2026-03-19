import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Pencil, Trash2, X, Check } from 'lucide-react';
import { useActionOrganize } from '../hooks/useActionOrganize';

interface ActionOrganizeBarProps {
    workspaceId: string;
    nodeId: string;
    nodeSource: 'persisted' | 'act';
    currentTitle: string;
    onDeleteSuccess?: () => void;
}

export function ActionOrganizeBar({ workspaceId, nodeId, nodeSource, currentTitle, onDeleteSuccess }: ActionOrganizeBarProps) {
    const { renameNode, deleteNode, isRenaming, isDeleting } = useActionOrganize(workspaceId, nodeSource);
    const [isEditMode, setIsEditMode] = useState(false);
    const [editModeVal, setEditModeVal] = useState(currentTitle);

    const handleRenameSubmit = async () => {
        if (!editModeVal.trim() || editModeVal === currentTitle) {
            setIsEditMode(false);
            return;
        }
        await renameNode(nodeId, editModeVal);
        setIsEditMode(false);
    };

    const handleDelete = async () => {
        if (confirm('Are you sure you want to delete this node?')) {
            await deleteNode(nodeId);
            if (onDeleteSuccess) {
                onDeleteSuccess();
            }
        }
    };

    if (isEditMode) {
        return (
            <div className="flex items-center gap-1">
                <Input
                    value={editModeVal}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEditModeVal(e.target.value)}
                    className="h-7 py-1 px-2 text-xs"
                    autoFocus
                    onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
                        if (e.key === 'Enter') handleRenameSubmit();
                        if (e.key === 'Escape') setIsEditMode(false);
                    }}
                />
                <Button variant="ghost" size="icon" className="h-7 w-7 text-primary hover:text-primary" onClick={handleRenameSubmit} disabled={isRenaming}>
                    <Check className="w-4 h-4" />
                </Button>
                <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground" onClick={() => setIsEditMode(false)}>
                    <X className="w-4 h-4" />
                </Button>
            </div>
        );
    }

    return (
        <div className="flex items-center gap-1 opacity-60 hover:opacity-100 transition-opacity">
            <Button variant="ghost" size="icon" className="h-7 w-7 hover:bg-muted" onClick={() => { setEditModeVal(currentTitle); setIsEditMode(true); }}>
                <Pencil className="w-3.5 h-3.5" />
                <span className="sr-only">Rename</span>
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={handleDelete} disabled={isDeleting}>
                <Trash2 className="w-3.5 h-3.5" />
                <span className="sr-only">Delete</span>
            </Button>
        </div>
    );
}
