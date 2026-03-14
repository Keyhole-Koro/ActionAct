import { useState } from 'react';
import { organizeService } from '@/services/organize';
import { actDraftService } from '@/services/actDraft/firestore';
import { toast } from 'sonner';

export function useActionOrganize(workspaceId: string, topicId: string) {
    const [isRenaming, setIsRenaming] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);

    const renameNode = async (nodeId: string, newTitle: string) => {
        setIsRenaming(true);
        try {
            try {
                await organizeService.renameNode(workspaceId, topicId, nodeId, newTitle);
            } catch (error) {
                await actDraftService.renameDraft(workspaceId, topicId, nodeId, newTitle);
                if (error) {
                    console.debug('rename fell back to actDraft', error);
                }
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
            try {
                await organizeService.deleteNode(workspaceId, topicId, nodeId);
            } catch (error) {
                await actDraftService.deleteDraft(workspaceId, topicId, nodeId);
                if (error) {
                    console.debug('delete fell back to actDraft', error);
                }
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
