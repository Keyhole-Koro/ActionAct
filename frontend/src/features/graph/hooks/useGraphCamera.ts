import { useCallback, useEffect, useRef } from 'react';
import { Node } from '@xyflow/react';
import { useReactFlow } from '@xyflow/react';
import {
    CAMERA_CONFIG,
    createSingleNodeFocusOptions,
} from '@/services/camera/cameraService';
import type { GraphNodeBase } from '../types';

const ZOOM_LEVELS = [0.4, 0.65, 1.0, 1.5] as const;

interface UseGraphCameraOptions {
    emphasizedDisplayNodes: Node[];
    actNodes: GraphNodeBase[];
    setActiveNode: (nodeId: string | null) => void;
    setSelectedNodes: (nodeIds: string[]) => void;
}

interface UseGraphCameraResult {
    focusNode: (nodeId: string) => void;
    focusActNode: (nodeId: string) => void;
    handleWheel: (event: React.WheelEvent) => void;
    pendingRadialFocusNodeIdRef: React.MutableRefObject<string | null>;
}

export function useGraphCamera({
    emphasizedDisplayNodes,
    actNodes,
    setActiveNode,
    setSelectedNodes,
}: UseGraphCameraOptions): UseGraphCameraResult {
    const reactFlowInstance = useReactFlow();
    const pendingRadialFocusNodeIdRef = useRef<string | null>(null);

    const focusNode = useCallback((nodeId: string) => {
        const targetNode = emphasizedDisplayNodes.find((node) => node.id === nodeId)
            ?? (actNodes as GraphNodeBase[]).find((node) => node.id === nodeId);
        if (!targetNode) {
            return;
        }

        setActiveNode(targetNode.id);
        const currentZoom = reactFlowInstance.getZoom();
        const animationOptions = createSingleNodeFocusOptions(currentZoom);
        reactFlowInstance.setCenter(
            targetNode.position.x + CAMERA_CONFIG.nodeOffsetX,
            targetNode.position.y + CAMERA_CONFIG.nodeOffsetY,
            { duration: animationOptions.duration, zoom: animationOptions.zoom },
        );
    }, [emphasizedDisplayNodes, actNodes, reactFlowInstance, setActiveNode]);

    const focusActNode = useCallback((nodeId: string) => {
        setSelectedNodes([nodeId]);
        focusNode(nodeId);
    }, [focusNode, setSelectedNodes]);

    // When pendingRadialFocusNodeId appears in displayNodes, focus on it.
    useEffect(() => {
        const pendingNodeId = pendingRadialFocusNodeIdRef.current;
        if (!pendingNodeId) {
            return;
        }

        if (!emphasizedDisplayNodes.some((node) => node.id === pendingNodeId)) {
            return;
        }

        pendingRadialFocusNodeIdRef.current = null;
        focusNode(pendingNodeId);
    }, [emphasizedDisplayNodes, focusNode]);

    const handleWheel = useCallback((event: React.WheelEvent) => {
        if (!event.ctrlKey && !event.metaKey) {
            return;
        }
        const currentZoom = reactFlowInstance.getZoom();
        const nearestIdx = ZOOM_LEVELS.reduce((best, level, idx) =>
            Math.abs(level - currentZoom) < Math.abs(ZOOM_LEVELS[best] - currentZoom) ? idx : best, 0);

        const delta = event.deltaY < 0 ? 1 : -1;
        const nextIdx = Math.min(Math.max(nearestIdx + delta, 0), ZOOM_LEVELS.length - 1);

        if (nextIdx !== nearestIdx) {
            reactFlowInstance.zoomTo(ZOOM_LEVELS[nextIdx], { duration: 200 });
        }
    }, [reactFlowInstance]);

    return {
        focusNode,
        focusActNode,
        handleWheel,
        pendingRadialFocusNodeIdRef,
    };
}
