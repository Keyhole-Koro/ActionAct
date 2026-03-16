"use client";

import React, { useMemo, useState } from 'react';

import type { GraphNodeRender } from '@/features/graph/types';

type RadialOverviewProps = {
    nodes: GraphNodeRender[];
    rootIds: string[];
    depthById: Map<string, number>;
    selectedNodeIds: string[];
    onActivateNode: (nodeId: string) => void;
    onToggleBranch: (nodeId: string) => void;
};

type RootSector = {
    id: string;
    label: string;
    startAngle: number;
    endAngle: number;
};

type Ring = {
    depth: number;
    radius: number;
};

export function RadialOverview({
    nodes,
    rootIds,
    depthById,
    selectedNodeIds,
    onActivateNode,
    onToggleBranch,
}: RadialOverviewProps) {
    const [hoveredRootId, setHoveredRootId] = useState<string | null>(null);

    const persistedNodes = useMemo(
        () => nodes.filter((node) => node.data?.nodeSource === 'persisted'),
        [nodes],
    );

    const rootById = useMemo(() => {
        const parentById = new Map(
            persistedNodes.map((node) => {
                const parentId = typeof node.data?.parentId === 'string' ? node.data.parentId : undefined;
                return [node.id, parentId];
            }),
        );

        const resolved = new Map<string, string>();
        for (const node of persistedNodes) {
            let currentId: string | undefined = node.id;
            let currentRoot = node.id;
            while (currentId) {
                const parentId = parentById.get(currentId);
                if (!parentId) {
                    currentRoot = currentId;
                    break;
                }
                currentId = parentId;
            }
            resolved.set(node.id, currentRoot);
        }
        return resolved;
    }, [persistedNodes]);

    const center = useMemo(() => {
        const rootNodes = persistedNodes.filter((node) => rootIds.includes(node.id));
        if (rootNodes.length === 0) {
            return { x: 920, y: 700 };
        }

        const points = rootNodes.map((node) => ({
            x: node.position.x,
            y: node.position.y,
        }));

        return {
            x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
            y: points.reduce((sum, point) => sum + point.y, 0) / points.length,
        };
    }, [persistedNodes, rootIds]);

    const rings = useMemo(() => {
        const depthGroups = new Map<number, Array<{ x: number; y: number }>>();

        persistedNodes.forEach((node) => {
            const depth = depthById.get(node.id) ?? 0;
            const bucket = depthGroups.get(depth) ?? [];
            bucket.push({ x: node.position.x, y: node.position.y });
            depthGroups.set(depth, bucket);
        });

        return [...depthGroups.entries()]
            .sort((left, right) => left[0] - right[0])
            .map(([depth, points]) => ({
                depth,
                radius: points.reduce((sum, point) => {
                    const dx = point.x - center.x;
                    const dy = point.y - center.y;
                    return sum + Math.sqrt((dx * dx) + (dy * dy));
                }, 0) / Math.max(points.length, 1),
            }));
    }, [center.x, center.y, depthById, persistedNodes]);

    const rootSectors = useMemo(() => {
        return persistedNodes
            .filter((node) => rootIds.includes(node.id))
            .map((node) => ({
                id: node.id,
                label: node.data?.label ?? node.id,
                angle: Math.atan2(node.position.y - center.y, node.position.x - center.x),
            }))
            .sort((left, right) => left.angle - right.angle)
            .map((root, index, roots) => {
                const previous = roots[(index - 1 + roots.length) % roots.length];
                const next = roots[(index + 1) % roots.length];
                const startAngle = midpointAngle(previous.angle, root.angle);
                const endAngle = midpointAngle(root.angle, next.angle);
                return {
                    id: root.id,
                    label: root.label,
                    startAngle,
                    endAngle: endAngle <= startAngle ? endAngle + (Math.PI * 2) : endAngle,
                };
            });
    }, [center.x, center.y, persistedNodes, rootIds]);

    return (
        <div className="relative h-full w-full overflow-hidden rounded-[28px] bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.98),rgba(248,250,252,0.92)_54%,rgba(241,245,249,0.92)_100%)]">
            <svg className="absolute inset-0 h-full w-full">
                {rootSectors.flatMap((sector, sectorIndex) => (
                    rings.map((ring, ringIndex) => {
                        const previousRadius = ringIndex === 0
                            ? Math.max(ring.radius - 74, 44)
                            : rings[ringIndex - 1].radius + 20;
                        const outerRadius = ring.radius + 52 + (hoveredRootId === sector.id ? 26 : 0);
                        const startAngle = sector.startAngle - (hoveredRootId === sector.id ? 0.05 : 0);
                        const endAngle = sector.endAngle + (hoveredRootId === sector.id ? 0.05 : 0);
                        const fillPalette = [
                            'rgba(191,219,254,0.22)',
                            'rgba(196,181,253,0.18)',
                            'rgba(167,243,208,0.18)',
                            'rgba(253,230,138,0.18)',
                        ];

                        return (
                            <path
                                key={`sector-${sector.id}-${ring.depth}`}
                                d={describeAnnularSector(center.x, center.y, previousRadius, outerRadius, startAngle, endAngle)}
                                fill={fillPalette[(sectorIndex + ringIndex) % fillPalette.length]}
                                stroke={hoveredRootId === sector.id ? 'rgba(148,163,184,0.48)' : 'rgba(255,255,255,0.7)'}
                                strokeWidth={hoveredRootId === sector.id ? 1.8 : 1}
                                onMouseEnter={() => setHoveredRootId(sector.id)}
                                onMouseLeave={() => setHoveredRootId(null)}
                                onClick={() => onActivateNode(sector.id)}
                                className="cursor-pointer transition-all duration-200"
                            />
                        );
                    })
                ))}
                {persistedNodes.map((node) => {
                    const rootId = rootById.get(node.id) ?? node.id;
                    const isHovered = hoveredRootId === rootId;
                    return (
                        <line
                            key={`ray-${node.id}`}
                            x1={center.x}
                            y1={center.y}
                            x2={node.position.x}
                            y2={node.position.y}
                            stroke={isHovered ? 'rgba(100,116,139,0.34)' : 'rgba(148,163,184,0.18)'}
                            strokeWidth={isHovered ? 2 : 1.2}
                        />
                    );
                })}
            </svg>

            {rootSectors.map((sector) => {
                const angle = (sector.startAngle + sector.endAngle) / 2;
                const labelRadius = (rings[0]?.radius ?? 180) + 46;
                const point = polarToCartesian(center.x, center.y, labelRadius, angle);
                const isHovered = hoveredRootId === sector.id;

                return (
                    <button
                        key={`sector-label-${sector.id}`}
                        type="button"
                        className={[
                            'absolute -translate-x-1/2 -translate-y-1/2 rounded-full border px-3 py-1.5 text-[11px] font-semibold backdrop-blur-sm transition-all duration-200',
                            isHovered
                                ? 'border-slate-400 bg-white text-slate-900 shadow-md'
                                : 'border-white/80 bg-white/84 text-slate-600 shadow-sm',
                        ].join(' ')}
                        style={{ left: point.x, top: point.y }}
                        onMouseEnter={() => setHoveredRootId(sector.id)}
                        onMouseLeave={() => setHoveredRootId(null)}
                        onFocus={() => setHoveredRootId(sector.id)}
                        onBlur={() => setHoveredRootId(null)}
                        onClick={() => onActivateNode(sector.id)}
                    >
                        {sector.label}
                    </button>
                );
            })}

            {persistedNodes.map((node) => {
                const rootId = rootById.get(node.id) ?? node.id;
                const isHovered = hoveredRootId === rootId;
                const hasHoveredRoot = hoveredRootId !== null;
                const depth = depthById.get(node.id) ?? 0;
                const selected = selectedNodeIds.includes(node.id);
                const baseSize = depth === 0 ? 88 : (depth === 1 ? 62 : (depth === 2 ? 52 : 42));
                const scale = isHovered ? 1.7 : (hasHoveredRoot ? 0.82 : 1);
                const fontSize = isHovered ? (depth === 0 ? 13 : 11) : (depth === 0 ? 10 : 9);

                return (
                    <button
                        key={`radial-node-${node.id}`}
                        type="button"
                        className={[
                            'absolute -translate-x-1/2 -translate-y-1/2 rounded-full border text-center transition-all duration-200',
                            selected
                                ? 'border-primary bg-white text-slate-900 shadow-md ring-2 ring-primary/70'
                                : 'border-white/90 bg-white/96 text-slate-700 shadow-sm',
                        ].join(' ')}
                        style={{
                            left: node.position.x,
                            top: node.position.y,
                            width: baseSize,
                            height: baseSize,
                            transform: `translate(-50%, -50%) scale(${scale})`,
                            zIndex: isHovered ? 50 : (selected ? 45 : 30),
                        }}
                        onMouseEnter={() => setHoveredRootId(rootId)}
                        onMouseLeave={() => setHoveredRootId(null)}
                        onClick={() => onActivateNode(node.id)}
                        onDoubleClick={() => onToggleBranch(node.id)}
                    >
                        <span
                            className="block px-2 font-semibold leading-tight"
                            style={{ fontSize }}
                        >
                            {node.data?.label}
                        </span>
                    </button>
                );
            })}
        </div>
    );
}

function midpointAngle(left: number, right: number) {
    let normalizedRight = right;
    if (normalizedRight < left) {
        normalizedRight += Math.PI * 2;
    }
    return (left + normalizedRight) / 2;
}

function polarToCartesian(cx: number, cy: number, radius: number, angle: number) {
    return {
        x: cx + (Math.cos(angle) * radius),
        y: cy + (Math.sin(angle) * radius),
    };
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
