import { Node, Edge } from '@xyflow/react';

export interface RadialLayoutOptions {
    radiusStep: number;
    baseAngularRange: [number, number]; // [minAngle, maxAngle] in radians
}

export interface RadialPosition {
    x: number;
    y: number;
    angle: number;
    radius: number;
    angularRange: [number, number];
}

/**
 * Calculates a radial layout for a tree structure.
 * Nodes at the same depth are placed on the same concentric circle.
 * Each subtree is allocated an angular segment proportional to its total number of leaves (or nodes).
 */
export function getRadialLayout(
    nodes: Node[],
    edges: Edge[],
    hoveredNodeId: string | null = null,
    options: RadialLayoutOptions = { radiusStep: 350, baseAngularRange: [0, 2 * Math.PI] }
): Map<string, RadialPosition> {
    const nodeMap = new Map<string, Node>(nodes.map(n => [n.id, n]));
    const childrenMap = new Map<string, string[]>();
    const parentMap = new Map<string, string>();

    // Build tree structure
    edges.forEach(edge => {
        const children = childrenMap.get(edge.source) || [];
        children.push(edge.target);
        childrenMap.set(edge.source, children);
        parentMap.set(edge.target, edge.source);
    });

    const roots = nodes.filter(n => !parentMap.has(n.id)).map(n => n.id);
    const subtreeSizeMap = new Map<string, number>();

    // Calculate subtree sizes (number of nodes in subtree)
    function calculateSubtreeSize(nodeId: string): number {
        const children = childrenMap.get(nodeId) || [];
        const size = 1 + children.reduce((sum, childId) => sum + calculateSubtreeSize(childId), 0);
        subtreeSizeMap.set(nodeId, size);
        return size;
    }
    roots.forEach(calculateSubtreeSize);

    const positions = new Map<string, RadialPosition>();

    // Recursively assign positions
    function assignPositions(
        nodeId: string,
        depth: number,
        startAngle: number,
        endAngle: number
    ) {
        const angle = (startAngle + endAngle) / 2;
        const radius = depth * options.radiusStep;

        positions.set(nodeId, {
            x: Math.cos(angle) * radius,
            y: Math.sin(angle) * radius,
            angle,
            radius,
            angularRange: [startAngle, endAngle],
        });

        const children = childrenMap.get(nodeId) || [];
        if (children.length === 0) return;

        // Expansion Logic: If this node or any ancestor is hovered, 
        // we could potentially inflate the angular range of its children.
        // For now, let's implement a simple proportional allocation.

        let currentAngle = startAngle;
        const totalSubtreeSize = children.reduce((sum, childId) => sum + subtreeSizeMap.get(childId)!, 0);
        const totalRange = endAngle - startAngle;

        children.forEach(childId => {
            const childSize = subtreeSizeMap.get(childId)!;
            const childRange = (childSize / totalSubtreeSize) * totalRange;
            assignPositions(childId, depth + 1, currentAngle, currentAngle + childRange);
            currentAngle += childRange;
        });
    }

    // Split base range among roots
    let currentRootAngle = options.baseAngularRange[0];
    const totalRootSize = roots.reduce((sum, rootId) => sum + subtreeSizeMap.get(rootId)!, 0);
    const totalRootRange = options.baseAngularRange[1] - options.baseAngularRange[0];

    roots.forEach(rootId => {
        const rootSize = subtreeSizeMap.get(rootId)!;
        const rootRange = (rootSize / totalRootSize) * totalRootRange;
        assignPositions(rootId, 1, currentRootAngle, currentRootAngle + rootRange);
        currentRootAngle += rootRange;
    });

    // Apply Hover Expansion
    if (hoveredNodeId) {
        return applyExpansion(positions, childrenMap, parentMap, hoveredNodeId);
    }

    return positions;
}

/**
 * Adjusts angular ranges to expand the area containing the hovered node's children.
 */
function applyExpansion(
    positions: Map<string, RadialPosition>,
    childrenMap: Map<string, string[]>,
    parentMap: Map<string, string>,
    hoveredNodeId: string
): Map<string, RadialPosition> {
    const expansionFactor = 2.5; // How much to magnify the focused area
    const hoveredPos = positions.get(hoveredNodeId);
    if (!hoveredPos) return positions;

    // The expansion should affect the children of the hovered node.
    // They should take up more of the angular space within their parent's range.

    const newPositions = new Map(positions);

    function expandRecursive(nodeId: string, factor: number) {
        const pos = newPositions.get(nodeId)!;
        const children = childrenMap.get(nodeId) || [];
        if (children.length === 0) return;

        // We want children of hoveredNodeId to expand.
        // This means we re-calculate their angular ranges within the parent's fixed range.
        // Actually, to make it look smooth, we should probably expand the hovered node's range 
        // and push others away, but for a "circular area expansion" per depth, 
        // we can just re-distribute children of the hovered node.

        // Simpler implementation for "zooming" into a branch:
        // We find the path from root to hovered node.
        // At each level on that path, the segment containing the next node in the path is expanded.

        // Let's try another approach: Angular Fisheye.
        // Distort the angles based on proximity to the hovered angle.
    }

    const targetAngle = hoveredPos.angle;
    const DISTORTION_STRENGTH = 1.5;

    // Angular Fisheye Distortion
    // f(theta) = theta_c + atan( (theta - theta_c) * strength ) / normalize
    // This isn't quite right for wrapping around 0/2pi.

    for (const [id, pos] of positions.entries()) {
        let diff = pos.angle - targetAngle;
        // Normalize diff to [-PI, PI]
        while (diff > Math.PI) diff -= 2 * Math.PI;
        while (diff < -Math.PI) diff += 2 * Math.PI;

        // Distortion: expansion near 0, compression far away
        // Using a smooth step or atan
        const distortedDiff = Math.atan(diff * DISTORTION_STRENGTH) * (Math.PI / Math.atan(Math.PI * DISTORTION_STRENGTH));
        const newAngle = targetAngle + distortedDiff;

        const radius = pos.radius;
        newPositions.set(id, {
            ...pos,
            angle: newAngle,
            x: Math.cos(newAngle) * radius,
            y: Math.sin(newAngle) * radius,
        });
    }

    return newPositions;
}
