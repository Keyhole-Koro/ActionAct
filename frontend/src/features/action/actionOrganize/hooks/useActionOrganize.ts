import { useState } from 'react';
import { organizeService } from '@/services/organize';
import { actDraftService } from '@/services/actDraft/firestore';
import { toast } from 'sonner';

export function useActionOrganize(workspaceId: string, nodeSource: 'persisted' | 'act') {
    const [isRenaming, setIsRenaming] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);

    const renameNode = async (nodeId: string, newTitle: string) => {
        setIsRenaming(true);
        try {
            if (nodeSource === 'persisted') {
                await organizeService.renameNode(workspaceId, nodeId, newTitle);
            } else {
                await actDraftService.renameDraft(workspaceId, nodeId, newTitle);
            }
            toast.success('Node renamed successfully');
        } catch (error) {
            console.error('Failed to rename node', error);
            toast.error('Failed to rename node');
        } finally {
            setIsRenaming(false);
        }
    };

    const deleteNode = async (nodeId: string) => {
        setIsDeleting(true);
        try {
            if (nodeSource === 'persisted') {
                await organizeService.deleteNode(workspaceId, nodeId);
            } else {
                await actDraftService.deleteDraft(workspaceId, nodeId);
            }
            toast.success('Node deleted successfully');
        } catch (error) {
            console.error('Failed to delete node', error);
            toast.error('Failed to delete node');
        } finally {
            setIsDeleting(false);
        }
    };

    return {
        renameNode,
        isRenaming,
        deleteNode,
        isDeleting,
    };
}
