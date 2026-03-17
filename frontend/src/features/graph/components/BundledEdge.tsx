"use client";

import React from 'react';
import { BaseEdge, EdgeLabelRenderer, type EdgeProps } from '@xyflow/react';

type BundledEdgeData = {
    bundlePoint?: { x: number; y: number };
    bundleBeta?: number;
    label?: string;
    labelStyle?: React.CSSProperties;
    labelBgStyle?: React.CSSProperties;
    labelBgPadding?: [number, number];
    labelBgBorderRadius?: number;
};

/**
 * Custom edge that supports cluster-based bundling.
 *
 * When `data.bundlePoint` is provided, both cubic-bezier control points are
 * blended toward that point (Holten-style hierarchical bundling):
 *   C1 = lerp(source, bundlePoint, β)
 *   C2 = lerp(target, bundlePoint, β)
 *
 * This causes all edges going between the same two clusters to converge into a
 * smooth visual bundle in the middle of the inter-cluster corridor.
 */
export function BundledEdge({
    id,
    sourceX,
    sourceY,
    targetX,
    targetY,
    style,
    markerEnd,
    data,
}: EdgeProps) {
    const edgeData = (data ?? {}) as BundledEdgeData;
    const bundlePoint = edgeData.bundlePoint;
    const beta = edgeData.bundleBeta ?? 0.68;

    let edgePath: string;
    let labelX: number;
    let labelY: number;

    if (bundlePoint) {
        // Control points blended toward shared bundle point
        const c1x = sourceX + (bundlePoint.x - sourceX) * beta;
        const c1y = sourceY + (bundlePoint.y - sourceY) * beta;
        const c2x = targetX + (bundlePoint.x - targetX) * beta;
        const c2y = targetY + (bundlePoint.y - targetY) * beta;

        edgePath = `M ${sourceX},${sourceY} C ${c1x},${c1y} ${c2x},${c2y} ${targetX},${targetY}`;

        // Approximate midpoint of the cubic bezier (t=0.5)
        const t = 0.5;
        const mt = 1 - t;
        labelX = mt * mt * mt * sourceX + 3 * mt * mt * t * c1x + 3 * mt * t * t * c2x + t * t * t * targetX;
        labelY = mt * mt * mt * sourceY + 3 * mt * mt * t * c1y + 3 * mt * t * t * c2y + t * t * t * targetY;
    } else {
        // Fallback: straight smooth bezier (similar to React Flow default)
        const dx = targetX - sourceX;
        const dy = targetY - sourceY;
        const offset = Math.min(Math.abs(dx), Math.abs(dy), 120) * 0.4 + 30;
        const c1x = sourceX + (dx > 0 ? offset : -offset) * 0.5 + dx * 0.25;
        const c1y = sourceY + dy * 0.25;
        const c2x = targetX - (dx > 0 ? offset : -offset) * 0.5 - dx * 0.25;
        const c2y = targetY - dy * 0.25;
        edgePath = `M ${sourceX},${sourceY} C ${c1x},${c1y} ${c2x},${c2y} ${targetX},${targetY}`;
        labelX = (sourceX + targetX) / 2;
        labelY = (sourceY + targetY) / 2;
    }

    return (
        <>
            <BaseEdge id={id} path={edgePath} style={style} markerEnd={markerEnd} />
            {edgeData.label && (
                <EdgeLabelRenderer>
                    <div
                        style={{
                            position: 'absolute',
                            transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
                            pointerEvents: 'all',
                            borderRadius: edgeData.labelBgBorderRadius ?? 4,
                            padding: edgeData.labelBgPadding ? `${edgeData.labelBgPadding[1]}px ${edgeData.labelBgPadding[0]}px` : '2px 4px',
                            ...(edgeData.labelBgStyle ?? {}),
                        }}
                    >
                        <span style={{ fontSize: 11, fontWeight: 600, ...(edgeData.labelStyle ?? {}) }}>
                            {edgeData.label}
                        </span>
                    </div>
                </EdgeLabelRenderer>
            )}
        </>
    );
}
