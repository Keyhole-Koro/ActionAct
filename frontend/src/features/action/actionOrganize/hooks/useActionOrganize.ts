import { useState } from 'react';
import { organizeService } from '@/services/organize';
import { toast } from 'sonner';

export function useActionOrganize(workspaceId: string, topicId: string) {
    const [isRenaming, setIsRenaming] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);

    const renameNode = async (nodeId: string, newTitle: string) => {
        setIsRenaming(true);
        try {
            await organizeService.renameNode(workspaceId, topicId, nodeId, newTitle);
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
            await organizeService.deleteNode(workspaceId, topicId, nodeId);
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
