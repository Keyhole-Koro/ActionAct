import React, { useCallback, useEffect, useRef } from 'react';
import { useReactFlow } from '@xyflow/react';
import { getAuth } from 'firebase/auth';
import { presenceService, type PresenceUser } from '@/services/presence/firestore';

interface UseGraphPresenceOptions {
    effectiveWorkspaceId: string | undefined | null;
}

interface UseGraphPresenceResult {
    otherCursors: PresenceUser[];
    handleCursorMove: (e: React.MouseEvent) => void;
}

export function useGraphPresence({
    effectiveWorkspaceId,
}: UseGraphPresenceOptions): UseGraphPresenceResult {
    const [otherCursors, setOtherCursors] = React.useState<PresenceUser[]>([]);
    const cursorThrottleRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const reactFlowInstance = useReactFlow();

    useEffect(() => {
        if (!effectiveWorkspaceId) return;
        return presenceService.subscribePresence(effectiveWorkspaceId, (users) => {
            const myUid = getAuth().currentUser?.uid;
            setOtherCursors(users.filter((u) => u.uid !== myUid && u.cursor != null));
        });
    }, [effectiveWorkspaceId]);

    const handleCursorMove = useCallback((e: React.MouseEvent) => {
        if (!effectiveWorkspaceId) return;
        const myUid = getAuth().currentUser?.uid;
        if (!myUid) return;
        if (cursorThrottleRef.current) return;
        cursorThrottleRef.current = setTimeout(() => {
            cursorThrottleRef.current = null;
        }, 100);
        const pos = reactFlowInstance.screenToFlowPosition({ x: e.clientX, y: e.clientY });
        presenceService.writeCursor(effectiveWorkspaceId, myUid, pos.x, pos.y);
    }, [effectiveWorkspaceId, reactFlowInstance]);

    return {
        otherCursors,
        handleCursorMove,
    };
}
