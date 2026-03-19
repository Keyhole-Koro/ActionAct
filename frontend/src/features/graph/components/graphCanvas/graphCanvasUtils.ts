import { Node } from '@xyflow/react';
import {
    getCollapsedNodeWidth,
    getExpandedNodeWidth,
    getLayoutDimensionsForNodeType,
} from '../../constants/nodeDimensions';
import type { GraphNodeRender } from '../../types';

export function isRenderableCoordinate(value: number | undefined) {
    return typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= 20000;
}

export function getDisplayNodeDimensions(node: Node<Record<string, unknown>>) {
    const data = (node.data ?? {}) as Partial<GraphNodeRender['data']>;

    if (data.layoutMode === 'radial' && data.nodeSource === 'persisted') {
        const radialDepth = typeof data.radialDepth === 'number' ? data.radialDepth : 0;
        const size = radialDepth === 0 ? 132 : (radialDepth === 1 ? 120 : (radialDepth === 2 ? 110 : 96));
        return { width: size, height: size };
    }

    const nodeKind = typeof data.kind === 'string' ? data.kind : undefined;
    const label = typeof data.label === 'string' ? data.label : undefined;
    const isExpanded = data.isExpanded === true;
    const hasChildNodes = data.hasChildNodes === true;
    const layoutDimensions = getLayoutDimensionsForNodeType(node.type, isExpanded, nodeKind);

    return {
        width: node.type === 'customTask'
            ? (isExpanded
                ? getExpandedNodeWidth(label, nodeKind)
                : getCollapsedNodeWidth(label, nodeKind, hasChildNodes))
            : layoutDimensions.width,
        height: layoutDimensions.height,
    };
}

export function overlapsWithMargin(left: Node<Record<string, unknown>>, right: Node<Record<string, unknown>>, margin = 28) {
    const leftDimensions = getDisplayNodeDimensions(left);
    const rightDimensions = getDisplayNodeDimensions(right);

    return !(
        left.position.x + leftDimensions.width + margin < right.position.x - margin
        || left.position.x - margin > right.position.x + rightDimensions.width + margin
        || left.position.y + leftDimensions.height + margin < right.position.y - margin
        || left.position.y - margin > right.position.y + rightDimensions.height + margin
    );
}

export function sameSortedIds(left: string[], right: string[]) {
    if (left.length !== right.length) {
        return false;
    }
    return left.every((id, index) => id === right[index]);
}

export function readClientPoint(event: React.MouseEvent | React.TouchEvent | MouseEvent | TouchEvent): { x: number; y: number } | null {
    const nativeEvent = 'nativeEvent' in event ? event.nativeEvent : event;

    if ('touches' in nativeEvent) {
        const touch = nativeEvent.touches[0] ?? nativeEvent.changedTouches[0];
        if (!touch) {
            return null;
        }
        return { x: touch.clientX, y: touch.clientY };
    }

    if ('clientX' in nativeEvent && 'clientY' in nativeEvent) {
        return { x: nativeEvent.clientX, y: nativeEvent.clientY };
    }

    return null;
}

type NodeSide = 'left' | 'right' | 'top' | 'bottom';

function oppositeSide(side: NodeSide): NodeSide {
    if (side === 'left') return 'right';
    if (side === 'right') return 'left';
    if (side === 'top') return 'bottom';
    return 'top';
}

export function resolveNearestSides(sourceNode: Node<Record<string, unknown>>, targetNode: Node<Record<string, unknown>>) {
    const sourceDimensions = getDisplayNodeDimensions(sourceNode);
    const targetDimensions = getDisplayNodeDimensions(targetNode);

    const sourceCenterX = sourceNode.position.x + (sourceDimensions.width / 2);
    const sourceCenterY = sourceNode.position.y + (sourceDimensions.height / 2);
    const targetCenterX = targetNode.position.x + (targetDimensions.width / 2);
    const targetCenterY = targetNode.position.y + (targetDimensions.height / 2);

    const deltaX = targetCenterX - sourceCenterX;
    const deltaY = targetCenterY - sourceCenterY;
    const useHorizontal = Math.abs(deltaX) >= Math.abs(deltaY);

    const sourceSide: NodeSide = useHorizontal
        ? (deltaX >= 0 ? 'right' : 'left')
        : (deltaY >= 0 ? 'bottom' : 'top');

    return {
        sourceSide,
        targetSide: oppositeSide(sourceSide),
    };
}
