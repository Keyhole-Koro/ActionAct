"use client";

import React, { useEffect, useMemo, useRef, useState } from 'react';

import type { GraphNodeRender } from '@/features/graph/types';

type RadialOverviewProps = {
    nodes: GraphNodeRender[];
    rootIds: string[];
    depthById: Map<string, number>;
    selectedNodeIds: string[];
    onActivateNode: (nodeId: string) => void;
    onToggleBranch: (nodeId: string) => void;
    onHoverNode?: (nodeId: string) => void;
    zoomBias?: number;
};

type Segment = {
    node: GraphNodeRender;
    rootId: string;
    depth: number;
    startAngle: number;
    endAngle: number;
    innerRadius: number;
    outerRadius: number;
    hue: number;
};

const INNER_RADIUS = 72;
const RING_THICKNESS = 78;
const RING_GAP = 10;
const ROOT_HUES = [198, 256, 148, 34, 320, 82, 12, 228];
const DEFAULT_VISIBLE_DEPTH = 10;
const MIN_CANVAS_WIDTH = 1880;
const MIN_CANVAS_HEIGHT = 1360;
const RADIAL_CANVAS_PADDING = 180;

export function RadialOverview({
    nodes,
    rootIds,
    depthById,
    selectedNodeIds,
    onActivateNode,
    onToggleBranch,
    onHoverNode,
    zoomBias = 1,
}: RadialOverviewProps) {
    const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
    const [zoom, setZoom] = useState(1);
    const viewportRef = useRef<HTMLDivElement | null>(null);
    const viewportAnimationRef = useRef<number | null>(null);
    const viewportTargetRef = useRef<{ left: number; top: number } | null>(null);
    const dragStateRef = useRef<{
        pointerId: number;
        startX: number;
        startY: number;
        scrollLeft: number;
        scrollTop: number;
    } | null>(null);

    const persistedNodes = useMemo(
        () => nodes.filter((node) => node.data?.nodeSource === 'persisted'),
        [nodes],
    );

    const nodeById = useMemo(
        () => new Map(persistedNodes.map((node) => [node.id, node])),
        [persistedNodes],
    );

    const parentById = useMemo(
        () => new Map(
            persistedNodes.map((node) => [
                node.id,
                typeof node.data?.parentId === 'string' ? node.data.parentId : undefined,
            ]),
        ),
        [persistedNodes],
    );

    const childrenByParent = useMemo(() => {
        const grouped = new Map<string | undefined, string[]>();

        persistedNodes.forEach((node) => {
            const parentId = parentById.get(node.id);
            const bucket = grouped.get(parentId) ?? [];
            bucket.push(node.id);
            grouped.set(parentId, bucket);
        });

        for (const [parentId, childIds] of grouped.entries()) {
            grouped.set(parentId, childIds.sort((leftId, rightId) => {
                const left = nodeById.get(leftId);
                const right = nodeById.get(rightId);
                const leftDepth = depthById.get(leftId) ?? 0;
                const rightDepth = depthById.get(rightId) ?? 0;
                const leftLabel = left?.data?.label ?? leftId;
                const rightLabel = right?.data?.label ?? rightId;

                return leftDepth - rightDepth || leftLabel.localeCompare(rightLabel);
            }));
        }

        return grouped;
    }, [depthById, nodeById, parentById, persistedNodes]);

    const ancestorPath = useMemo(() => {
        if (!hoveredNodeId) {
            return [];
        }

        const path: string[] = [];
        let currentId: string | undefined = hoveredNodeId;

        while (currentId) {
            path.unshift(currentId);
            currentId = parentById.get(currentId);
        }

        return path;
    }, [hoveredNodeId, parentById]);

    const ancestorSet = useMemo(() => new Set(ancestorPath), [ancestorPath]);

    const descendantSet = useMemo(() => {
        if (!hoveredNodeId) {
            return new Set<string>();
        }

        const visited = new Set<string>();
        const queue = [hoveredNodeId];

        while (queue.length > 0) {
            const currentId = queue.shift();
            if (!currentId || visited.has(currentId)) {
                continue;
            }
            visited.add(currentId);
            const childIds = childrenByParent.get(currentId) ?? [];
            queue.push(...childIds);
        }

        return visited;
    }, [childrenByParent, hoveredNodeId]);

    const visibleNodeIds = useMemo(() => {
        const ids = new Set<string>();

        persistedNodes.forEach((node) => {
            const depth = depthById.get(node.id) ?? 0;
            if (hoveredNodeId === null) {
                if (depth <= DEFAULT_VISIBLE_DEPTH) {
                    ids.add(node.id);
                }
                return;
            }

            if (depth <= DEFAULT_VISIBLE_DEPTH || ancestorSet.has(node.id) || descendantSet.has(node.id)) {
                ids.add(node.id);
            }
        });

        return ids;
    }, [ancestorSet, depthById, descendantSet, hoveredNodeId, persistedNodes]);

    const subtreeSizeById = useMemo(() => {
        const memo = new Map<string, number>();

        const countSubtree = (nodeId: string): number => {
            const cached = memo.get(nodeId);
            if (cached !== undefined) {
                return cached;
            }

            const childIds = (childrenByParent.get(nodeId) ?? [])
                .filter((childId) => visibleNodeIds.has(childId));

            const size = 1 + childIds.reduce((sum, childId) => sum + countSubtree(childId), 0);
            memo.set(nodeId, size);
            return size;
        };

        visibleNodeIds.forEach((nodeId) => {
            countSubtree(nodeId);
        });

        return memo;
    }, [childrenByParent, visibleNodeIds]);

    const segments = useMemo(() => {
        const result: Segment[] = [];
        const orderedRootIds = rootIds.filter((rootId) => visibleNodeIds.has(rootId));
        if (orderedRootIds.length === 0) {
            return result;
        }

        assignSegments({
            nodeIds: orderedRootIds,
            startAngle: -Math.PI / 2,
            endAngle: (Math.PI * 3) / 2,
            depth: 0,
            rootId: null,
            result,
            nodeById,
            childrenByParent,
            visibleNodeIds,
            subtreeSizeById,
            hoveredNodeId,
            branchHue: null,
        });

        return result;
    }, [
        childrenByParent,
        hoveredNodeId,
        nodeById,
        rootIds,
        subtreeSizeById,
        visibleNodeIds,
    ]);

    const layoutMetrics = useMemo(() => {
        const maxPersistedDepth = [...depthById.values()].reduce((max, depth) => Math.max(max, depth), 0);
        const maxRingDepth = Math.max(maxPersistedDepth, 0);
        const radialExtent = getRingOuterRadius(maxRingDepth) + 84;
        const canvasRadius = radialExtent + RADIAL_CANVAS_PADDING;
        const width = Math.max(MIN_CANVAS_WIDTH, Math.ceil(canvasRadius * 2));
        const height = Math.max(MIN_CANVAS_HEIGHT, Math.ceil(canvasRadius * 2));
        return {
            centerX: width / 2,
            centerY: height / 2,
            width,
            height,
        };
    }, [depthById]);

    const effectiveZoom = Math.min(Math.max(zoom * zoomBias, 0.6), 2.4);
    const scaledCanvasWidth = Math.ceil(layoutMetrics.width * effectiveZoom);
    const scaledCanvasHeight = Math.ceil(layoutMetrics.height * effectiveZoom);
    const scaledCenterX = layoutMetrics.centerX * effectiveZoom;
    const scaledCenterY = layoutMetrics.centerY * effectiveZoom;

    useEffect(() => {
        const viewport = viewportRef.current;
        if (!viewport) {
            return;
        }

        viewport.scrollLeft = Math.max((scaledCanvasWidth - viewport.clientWidth) / 2, 0);
        viewport.scrollTop = Math.max((scaledCanvasHeight - viewport.clientHeight) / 2, 0);
    }, [scaledCanvasHeight, scaledCanvasWidth]);

    const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
        const viewport = viewportRef.current;
        if (!viewport) {
            return;
        }

        dragStateRef.current = {
            pointerId: event.pointerId,
            startX: event.clientX,
            startY: event.clientY,
            scrollLeft: viewport.scrollLeft,
            scrollTop: viewport.scrollTop,
        };

        viewport.setPointerCapture(event.pointerId);
    };

    const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
        const viewport = viewportRef.current;
        const dragState = dragStateRef.current;
        if (!viewport || !dragState || dragState.pointerId !== event.pointerId) {
            return;
        }

        const deltaX = event.clientX - dragState.startX;
        const deltaY = event.clientY - dragState.startY;
        viewport.scrollLeft = dragState.scrollLeft - deltaX;
        viewport.scrollTop = dragState.scrollTop - deltaY;
    };

    const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
        const viewport = viewportRef.current;
        const dragState = dragStateRef.current;
        if (!viewport || !dragState || dragState.pointerId !== event.pointerId) {
            return;
        }

        viewport.releasePointerCapture(event.pointerId);
        dragStateRef.current = null;
    };

    const handleWheel = (event: React.WheelEvent<HTMLDivElement>) => {
        const viewport = viewportRef.current;
        if (!viewport) {
            return;
        }

        if (event.ctrlKey || event.metaKey) {
            event.preventDefault();
            setZoom((currentZoom) => {
                const nextZoom = currentZoom + (event.deltaY < 0 ? 0.08 : -0.08);
                return Math.min(Math.max(nextZoom, 0.85), 2);
            });
            return;
        }

        viewport.scrollLeft += event.deltaX;
        viewport.scrollTop += event.deltaY;
    };

    const focusViewportOnPoint = (x: number, y: number) => {
        const viewport = viewportRef.current;
        if (!viewport) {
            return;
        }

        const nextLeft = Math.max(
            Math.min(x - (viewport.clientWidth / 2), scaledCanvasWidth - viewport.clientWidth),
            0,
        );
        const nextTop = Math.max(
            Math.min(y - (viewport.clientHeight / 2), scaledCanvasHeight - viewport.clientHeight),
            0,
        );

        viewportTargetRef.current = { left: nextLeft, top: nextTop };

        if (viewportAnimationRef.current !== null) {
            return;
        }

        const step = () => {
            const currentViewport = viewportRef.current;
            const currentTarget = viewportTargetRef.current;

            if (!currentViewport || !currentTarget) {
                viewportAnimationRef.current = null;
                return;
            }

            const deltaLeft = currentTarget.left - currentViewport.scrollLeft;
            const deltaTop = currentTarget.top - currentViewport.scrollTop;

            currentViewport.scrollLeft += deltaLeft * 0.12;
            currentViewport.scrollTop += deltaTop * 0.12;

            if (Math.abs(deltaLeft) < 0.6 && Math.abs(deltaTop) < 0.6) {
                currentViewport.scrollLeft = currentTarget.left;
                currentViewport.scrollTop = currentTarget.top;
                viewportAnimationRef.current = null;
                return;
            }

            viewportAnimationRef.current = window.requestAnimationFrame(step);
        };

        viewportAnimationRef.current = window.requestAnimationFrame(step);
    };

    return (
        <div
            ref={viewportRef}
            className="relative h-full w-full overflow-auto rounded-[28px] bg-slate-50 cursor-grab active:cursor-grabbing"
            onMouseLeave={() => setHoveredNodeId(null)}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            onWheel={handleWheel}
        >
            <div
                className="relative"
                style={{ width: scaledCanvasWidth, height: scaledCanvasHeight }}
            >
            <svg className="absolute inset-0" width={scaledCanvasWidth} height={scaledCanvasHeight}>
                {segments.map((segment, index) => {
                    const isFocused = hoveredNodeId !== null
                        && (ancestorSet.has(segment.node.id) || descendantSet.has(segment.node.id));
                    const isMuted = hoveredNodeId !== null && !isFocused;
                    const palette = getSegmentPalette(segment.hue, segment.depth);
                    const segmentCenterPoint = polarToCartesian(
                        scaledCenterX,
                        scaledCenterY,
                        getNodeOrbitRadius(segment.depth) * effectiveZoom,
                        (segment.startAngle + segment.endAngle) / 2,
                    );

                    return (
                        <g key={`segment-${segment.node.id}`}>
                            <path
                                d={describeAnnularSector(
                                    scaledCenterX,
                                    scaledCenterY,
                                    segment.innerRadius * effectiveZoom,
                                    segment.outerRadius * effectiveZoom,
                                    segment.startAngle,
                                    segment.endAngle,
                                )}
                                fill={palette[0]}
                                fillOpacity={isMuted ? 0.18 : (isFocused ? 0.96 : 0.74)}
                                stroke={palette[1]}
                                strokeOpacity={isMuted ? 0.22 : 0.92}
                                strokeWidth={isFocused ? 2.2 : 1.2}
                                className="cursor-pointer transition-all duration-500 ease-out"
                                onMouseEnter={() => {
                                    setHoveredNodeId(segment.node.id);
                                    focusViewportOnPoint(segmentCenterPoint.x, segmentCenterPoint.y);
                                    onHoverNode?.(segment.node.id);
                                }}
                                onClick={() => onActivateNode(segment.node.id)}
                            />
                            <path
                                d={describeRadialGuide(
                                    scaledCenterX,
                                    scaledCenterY,
                                    segment.innerRadius * effectiveZoom,
                                    segment.outerRadius * effectiveZoom,
                                    (segment.startAngle + segment.endAngle) / 2,
                                )}
                                stroke={isMuted ? 'rgba(148,163,184,0.08)' : 'rgba(71,85,105,0.16)'}
                                strokeWidth={isFocused ? 1.6 : 1}
                                strokeLinecap="round"
                            />
                        </g>
                    );
                })}
            </svg>

            {segments.map((segment) => {
                const point = polarToCartesian(
                    scaledCenterX,
                    scaledCenterY,
                    getNodeOrbitRadius(segment.depth) * effectiveZoom,
                    (segment.startAngle + segment.endAngle) / 2,
                );
                const isSelected = selectedNodeIds.includes(segment.node.id);
                const isFocused = hoveredNodeId !== null
                    && (ancestorSet.has(segment.node.id) || descendantSet.has(segment.node.id));
                const isMuted = hoveredNodeId !== null && !isFocused;
                const depth = segment.depth;
                const scale = hoveredNodeId === null
                    ? (depth === 0 ? 1 : (depth === 1 ? 0.88 : 0.78))
                    : (isFocused ? (depth <= 1 ? 1.22 : 1.48) : (depth <= 1 ? 0.82 : 0.58));
                const baseSize = depth === 0 ? 66 : (depth === 1 ? 40 : (depth === 2 ? 24 : 18));
                const size = Math.round(baseSize * scale);
                const baseFontSize = hoveredNodeId !== null && isFocused
                    ? (depth === 0 ? 11.5 : (depth === 1 ? 10 : 8.5))
                    : (depth === 0 ? 8.5 : (depth === 1 ? 7.5 : 6.5));
                const fontSize = baseFontSize * Math.max(scale, 0.85);

                return (
                    <button
                        key={`node-${segment.node.id}`}
                        type="button"
                        className={[
                            'absolute -translate-x-1/2 -translate-y-1/2 rounded-full border text-center shadow-sm transition-all duration-500 ease-out',
                            isSelected
                                ? 'border-primary bg-white text-slate-900 ring-2 ring-primary/60'
                                : 'border-white/90 bg-white text-slate-700',
                        ].join(' ')}
                        style={{
                            left: point.x,
                            top: point.y,
                            width: size,
                            height: size,
                            transform: 'translate(-50%, -50%)',
                            opacity: isMuted ? (depth <= 1 ? 0.36 : 0.08) : 1,
                            zIndex: isFocused ? 40 : (isSelected ? 35 : 20),
                        }}
                        onMouseEnter={() => {
                            setHoveredNodeId(segment.node.id);
                            focusViewportOnPoint(point.x, point.y);
                            onHoverNode?.(segment.node.id);
                        }}
                        onFocus={() => setHoveredNodeId(segment.node.id)}
                        onBlur={() => setHoveredNodeId(null)}
                        onClick={() => onActivateNode(segment.node.id)}
                        onDoubleClick={() => onToggleBranch(segment.node.id)}
                    >
                        <span
                            className="block px-1 font-semibold leading-tight"
                            style={{ fontSize }}
                        >
                            {formatRadialLabel(
                                segment.node.data?.label ?? segment.node.id,
                                depth,
                                hoveredNodeId !== null && isFocused,
                            )}
                        </span>
                    </button>
                );
            })}

            {segments
                .filter((segment) => segment.depth === 0)
                .map((segment) => {
                    const labelPoint = polarToCartesian(
                        scaledCenterX,
                        scaledCenterY,
                        getRootLabelRadius() * effectiveZoom,
                        (segment.startAngle + segment.endAngle) / 2,
                    );
                    const isHovered = hoveredNodeId === segment.node.id || descendantSet.has(segment.node.id);

                    return (
                        <button
                            key={`root-label-${segment.node.id}`}
                        type="button"
                            className={[
                                'absolute -translate-x-1/2 -translate-y-1/2 rounded-full border px-3 py-1 text-[11px] font-semibold transition-all duration-500 ease-out',
                            isHovered
                                ? 'border-slate-400 bg-white text-slate-900 shadow-md'
                                : 'border-white/90 bg-white/92 text-slate-600 shadow-sm',
                            ].join(' ')}
                            style={{ left: labelPoint.x, top: labelPoint.y }}
                            onMouseEnter={() => {
                                setHoveredNodeId(segment.node.id);
                                focusViewportOnPoint(labelPoint.x, labelPoint.y);
                                onHoverNode?.(segment.node.id);
                            }}
                            onFocus={() => setHoveredNodeId(segment.node.id)}
                            onBlur={() => setHoveredNodeId(null)}
                            onClick={() => onActivateNode(segment.node.id)}
                        >
                            {formatRootLabel(segment.node.data?.label ?? segment.node.id)}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}

function assignSegments({
    nodeIds,
    startAngle,
    endAngle,
    depth,
    rootId,
    result,
    nodeById,
    childrenByParent,
    visibleNodeIds,
    subtreeSizeById,
    hoveredNodeId,
    branchHue,
}: {
    nodeIds: string[];
    startAngle: number;
    endAngle: number;
    depth: number;
    rootId: string | null;
    result: Segment[];
    nodeById: Map<string, GraphNodeRender>;
    childrenByParent: Map<string | undefined, string[]>;
    visibleNodeIds: Set<string>;
    subtreeSizeById: Map<string, number>;
    hoveredNodeId: string | null;
    branchHue: number | null;
}) {
    const availableIds = nodeIds.filter((nodeId) => visibleNodeIds.has(nodeId));
    if (availableIds.length === 0) {
        return;
    }

    const siblingGap = Math.min(0.08, depth === 0 ? 0.06 : (depth === 1 ? 0.04 : 0.025));
    const totalGap = siblingGap * Math.max(availableIds.length - 1, 0);
    const span = Math.max(endAngle - startAngle - totalGap, 0.24);

    const weightedChildren = availableIds.map((nodeId) => {
        const subtreeSize = subtreeSizeById.get(nodeId) ?? 1;
        const branchContainsHover = hoveredNodeId !== null && isSameOrAncestor(nodeId, hoveredNodeId, childrenByParent);
        const sizeFactor = Math.min(Math.log2(subtreeSize + 1), 3) / 3;
        const branchMultiplier = hoveredNodeId === null
            ? 1
            : (nodeId === hoveredNodeId
                ? (1.22 + (sizeFactor * 0.26))
                : (branchContainsHover ? (1.1 + (sizeFactor * 0.18)) : 0.9));

        return {
            nodeId,
            weight: subtreeSize * branchMultiplier,
        };
    });

    const totalWeight = weightedChildren.reduce((sum, child) => sum + child.weight, 0);
    let cursor = startAngle;

    weightedChildren.forEach(({ nodeId, weight }) => {
        const node = nodeById.get(nodeId);
        if (!node) {
            return;
        }

        const childSpan = span * (weight / Math.max(totalWeight, 1));
        const childStart = cursor;
        const childEnd = childStart + childSpan;
        const resolvedRootId = rootId ?? nodeId;
        const innerRadius = getRingInnerRadius(depth);
        const outerRadius = getRingOuterRadius(depth);
        const siblingIds = availableIds;
        const siblingIndex = siblingIds.indexOf(nodeId);
        const normalizedOffset = siblingIds.length <= 1
            ? 0
            : ((siblingIndex / (siblingIds.length - 1)) - 0.5);
        const rootHue = branchHue ?? ROOT_HUES[siblingIndex % ROOT_HUES.length];
        const childHue = normalizeHue(rootHue + (normalizedOffset * Math.max(28 - (depth * 5), 8)));

        result.push({
            node,
            rootId: resolvedRootId,
            depth,
            startAngle: childStart,
            endAngle: childEnd,
            innerRadius,
            outerRadius,
            hue: childHue,
        });

        const childIds = childrenByParent.get(nodeId) ?? [];
        assignSegments({
            nodeIds: childIds,
            startAngle: childStart,
            endAngle: childEnd,
            depth: depth + 1,
            rootId: resolvedRootId,
            result,
            nodeById,
            childrenByParent,
            visibleNodeIds,
            subtreeSizeById,
            hoveredNodeId,
            branchHue: childHue,
        });

        cursor = childEnd + siblingGap;
    });
}

function getRingInnerRadius(depth: number) {
    return INNER_RADIUS + (depth * (RING_THICKNESS + RING_GAP));
}

function getRingOuterRadius(depth: number) {
    return getRingInnerRadius(depth) + RING_THICKNESS;
}

function getNodeOrbitRadius(depth: number) {
    return getRingInnerRadius(depth) + (RING_THICKNESS / 2);
}

function getRootLabelRadius() {
    return getRingOuterRadius(0) + 28;
}

function getSegmentPalette(hue: number, depth: number): [string, string] {
    const saturation = Math.max(72 - (depth * 4), 54);
    const fillLightness = Math.min(86 + (depth * 2), 94);
    const strokeLightness = Math.min(74 + (depth * 2), 88);

    return [
        `hsla(${hue} ${saturation}% ${fillLightness}% / 1)`,
        `hsla(${hue} ${Math.min(saturation + 4, 82)}% ${strokeLightness}% / 1)`,
    ];
}

function normalizeHue(hue: number) {
    const normalized = hue % 360;
    return normalized < 0 ? normalized + 360 : normalized;
}

function isSameOrAncestor(
    possibleAncestorId: string,
    nodeId: string,
    childrenByParent: Map<string | undefined, string[]>,
) {
    if (possibleAncestorId === nodeId) {
        return true;
    }

    const queue = [...(childrenByParent.get(possibleAncestorId) ?? [])];
    while (queue.length > 0) {
        const currentId = queue.shift();
        if (!currentId) {
            continue;
        }
        if (currentId === nodeId) {
            return true;
        }
        queue.push(...(childrenByParent.get(currentId) ?? []));
    }

    return false;
}

function formatRootLabel(label: string) {
    return truncateLabel(label, 20);
}

function formatRadialLabel(label: string, depth: number, isFocused: boolean) {
    if (isFocused) {
        return depth <= 1 ? truncateLabel(label, 24) : truncateLabel(label, 18);
    }

    return truncateLabel(label, depth === 0 ? 14 : (depth === 1 ? 10 : 7));
}

function truncateLabel(label: string, maxLength: number) {
    return label.length <= maxLength ? label : `${label.slice(0, maxLength - 1)}…`;
}

function polarToCartesian(cx: number, cy: number, radius: number, angle: number) {
    return {
        x: cx + (Math.cos(angle) * radius),
        y: cy + (Math.sin(angle) * radius),
    };
}

function describeRadialGuide(
    cx: number,
    cy: number,
    innerRadius: number,
    outerRadius: number,
    angle: number,
) {
    const inner = polarToCartesian(cx, cy, innerRadius, angle);
    const outer = polarToCartesian(cx, cy, outerRadius, angle);

    return `M ${inner.x} ${inner.y} L ${outer.x} ${outer.y}`;
}

function describeAnnularSector(
    cx: number,
    cy: number,
    innerRadius: number,
    outerRadius: number,
    startAngle: number,
    endAngle: number,
) {
    const startOuter = polarToCartesian(cx, cy, outerRadius, startAngle);
    const endOuter = polarToCartesian(cx, cy, outerRadius, endAngle);
    const startInner = polarToCartesian(cx, cy, innerRadius, startAngle);
    const endInner = polarToCartesian(cx, cy, innerRadius, endAngle);
    const largeArcFlag = endAngle - startAngle > Math.PI ? 1 : 0;

    return [
        `M ${startOuter.x} ${startOuter.y}`,
        `A ${outerRadius} ${outerRadius} 0 ${largeArcFlag} 1 ${endOuter.x} ${endOuter.y}`,
        `L ${endInner.x} ${endInner.y}`,
        `A ${innerRadius} ${innerRadius} 0 ${largeArcFlag} 0 ${startInner.x} ${startInner.y}`,
        'Z',
    ].join(' ');
}
