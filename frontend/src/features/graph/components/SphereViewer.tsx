"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useGraphStore } from '@/features/graph/store';
import type { GraphNodeBase } from '@/features/graph/types';
import { buildVisibleHierarchy } from '@/features/graph/model/hierarchy';

// ── Constants ─────────────────────────────────────────────────────────────────
const SPHERE_R = 300;
const ACT_INNER = 0.52;
const ROOT_HUES = [210, 145, 280, 50, 175, 330, 100, 0];
const AUTO_ROTATE_SPEED = 0.003;
const FOV = 1000;
const GOLDEN_RATIO = (1 + Math.sqrt(5)) / 2;

const P_W = 88; const P_H = 28; const P_R = 7;
const A_W = 78; const A_H = 24; const A_R = 6;

// ── Types ─────────────────────────────────────────────────────────────────────
type Vec3 = [number, number, number];

type RenderNode = {
    id: string; label: string; pos3: Vec3;
    kind: 'persisted' | 'act'; hue: number;
    isSelected: boolean; actStage?: string;
};

type RenderEdge = {
    from: Vec3; to: Vec3; highlighted: boolean;
    kind: 'graph' | 'reference';
};

// ── Math helpers ──────────────────────────────────────────────────────────────
function rotY(p: Vec3, a: number): Vec3 {
    const c = Math.cos(a), s = Math.sin(a);
    return [p[0] * c + p[2] * s, p[1], -p[0] * s + p[2] * c];
}
function rotX(p: Vec3, a: number): Vec3 {
    const c = Math.cos(a), s = Math.sin(a);
    return [p[0], p[1] * c - p[2] * s, p[1] * s + p[2] * c];
}
function project(p: Vec3, cx: number, cy: number): [number, number, number] {
    const z = p[2] + FOV;
    const scale = FOV / Math.max(z, 1);
    return [cx + p[0] * scale, cy - p[1] * scale, p[2]];
}
function normalize(p: Vec3): Vec3 {
    const len = Math.sqrt(p[0] ** 2 + p[1] ** 2 + p[2] ** 2) || 1;
    return [p[0] / len, p[1] / len, p[2] / len];
}
function projectOntoSphere(p: Vec3, r: number): Vec3 {
    const n = normalize(p);
    return [n[0] * r, n[1] * r, n[2] * r];
}
function tangentialComponent(force: Vec3, normal: Vec3): Vec3 {
    // Remove the radial component — keep only the tangential part
    const dot = force[0] * normal[0] + force[1] * normal[1] + force[2] * normal[2];
    return [force[0] - dot * normal[0], force[1] - dot * normal[1], force[2] - dot * normal[2]];
}
function truncate(s: string, n = 12): string {
    return s.length <= n ? s : s.slice(0, n - 1) + '…';
}

// ── Fibonacci seed positions ───────────────────────────────────────────────────
function fibonacciPositions(ids: string[], r: number): Map<string, Vec3> {
    const n = ids.length;
    const map = new Map<string, Vec3>();
    ids.forEach((id, i) => {
        const theta = Math.acos(1 - (2 * (i + 0.5)) / n);
        const phi = (2 * Math.PI * i) / GOLDEN_RATIO;
        map.set(id, [r * Math.sin(theta) * Math.cos(phi), r * Math.cos(theta), r * Math.sin(theta) * Math.sin(phi)]);
    });
    return map;
}

// ── Spherical force-directed layout ──────────────────────────────────────────
// Runs a force simulation where all nodes are constrained to the sphere surface.
// Edge attraction pulls connected nodes toward each other along the surface;
// charge repulsion pushes all nodes apart.
type LayoutEdge = { source: string; target: string; weight: number };

function layoutSphericalForce(
    nodeIds: string[],
    edges: LayoutEdge[],
): Map<string, Vec3> {
    if (nodeIds.length === 0) return new Map();

    const ITERATIONS = 220;
    // Electrostatic repulsion — pushes all nodes apart
    const K_REP = 90000;
    // Spring constants — pull connected nodes together
    const K_SPRING = 0.025;         // graph edges
    const K_PARENT = 0.055;         // parent-child (stronger clustering)
    // Rest lengths (chord distance): short = pull connected nodes close
    const REST_EDGE   = SPHERE_R * 0.42;   // ≈ 126  (graph edge target distance)
    const REST_PARENT = SPHERE_R * 0.30;   // ≈  90  (parent-child even tighter)
    const DAMPING = 0.82;
    const INITIAL_TEMP = 1.0;
    const COOLING = 0.982;   // 0.982^220 ≈ 0.018  (cools gently)

    const positions = fibonacciPositions(nodeIds, SPHERE_R);
    const velocities = new Map(nodeIds.map((id) => [id, [0, 0, 0] as Vec3]));

    let temp = INITIAL_TEMP;

    for (let iter = 0; iter < ITERATIONS; iter++) {
        const forces = new Map(nodeIds.map((id) => [id, [0, 0, 0] as Vec3]));

        // ① Repulsion between every pair (Coulomb-style)
        for (let i = 0; i < nodeIds.length; i++) {
            for (let j = i + 1; j < nodeIds.length; j++) {
                const a = positions.get(nodeIds[i])!;
                const b = positions.get(nodeIds[j])!;
                const dx = a[0] - b[0], dy = a[1] - b[1], dz = a[2] - b[2];
                const dist = Math.sqrt(dx * dx + dy * dy + dz * dz) || 0.1;
                const mag = K_REP / (dist * dist);
                const nx = dx / dist, ny = dy / dist, nz = dz / dist;
                const fa = forces.get(nodeIds[i])!;
                const fb = forces.get(nodeIds[j])!;
                fa[0] += nx * mag; fa[1] += ny * mag; fa[2] += nz * mag;
                fb[0] -= nx * mag; fb[1] -= ny * mag; fb[2] -= nz * mag;
            }
        }

        // ② Attraction along edges (Hooke spring toward short rest length)
        for (const edge of edges) {
            const a = positions.get(edge.source);
            const b = positions.get(edge.target);
            if (!a || !b) continue;
            const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
            const dist = Math.sqrt(dx * dx + dy * dy + dz * dz) || 0.1;
            const isParent = edge.weight > 1;
            const rest = isParent ? REST_PARENT : REST_EDGE;
            const k    = isParent ? K_PARENT    : K_SPRING;
            const mag  = k * (dist - rest);   // positive = attractive, negative = repulsive
            const nx = dx / dist, ny = dy / dist, nz = dz / dist;
            const fa = forces.get(edge.source);
            const fb = forces.get(edge.target);
            if (fa) { fa[0] += nx * mag; fa[1] += ny * mag; fa[2] += nz * mag; }
            if (fb) { fb[0] -= nx * mag; fb[1] -= ny * mag; fb[2] -= nz * mag; }
        }

        // ③ Integrate: keep only the tangential component, then re-project onto sphere
        for (const id of nodeIds) {
            const pos = positions.get(id)!;
            const vel = velocities.get(id)!;
            const f   = forces.get(id)!;
            const normal = normalize(pos);
            const tf = tangentialComponent(f, normal);   // stay on sphere

            vel[0] = (vel[0] + tf[0] * temp) * DAMPING;
            vel[1] = (vel[1] + tf[1] * temp) * DAMPING;
            vel[2] = (vel[2] + tf[2] * temp) * DAMPING;

            const next: Vec3 = [pos[0] + vel[0], pos[1] + vel[1], pos[2] + vel[2]];
            positions.set(id, projectOntoSphere(next, SPHERE_R));
        }

        temp *= COOLING;
    }

    return positions;
}

// ── Rounded rect helper ───────────────────────────────────────────────────────
function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.arcTo(x + w, y, x + w, y + r, r);
    ctx.lineTo(x + w, y + h - r);
    ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h);
    ctx.arcTo(x, y + h, x, y + h - r, r);
    ctx.lineTo(x, y + r);
    ctx.arcTo(x, y, x + r, y, r);
    ctx.closePath();
}

// ── Canvas renderer ───────────────────────────────────────────────────────────
function drawFrame(
    ctx: CanvasRenderingContext2D,
    w: number, h: number,
    renderNodes: RenderNode[],
    renderEdges: RenderEdge[],
    ry: number, rx: number,
    hoverId: string | null,
    dpr: number,
) {
    ctx.clearRect(0, 0, w, h);
    const cx = w / 2, cy = h / 2;

    function tp(p: Vec3): [number, number, number] {
        return project(rotX(rotY(p, ry), rx), cx, cy);
    }

    // Wireframe sphere
    ctx.save();
    ctx.strokeStyle = 'rgba(96,160,255,0.06)';
    ctx.lineWidth = 0.5 * dpr;
    for (let lat = -80; lat <= 80; lat += 20) {
        const y = SPHERE_R * Math.sin((lat * Math.PI) / 180);
        const r = Math.sqrt(Math.max(SPHERE_R * SPHERE_R - y * y, 0));
        ctx.beginPath();
        for (let lon = 0; lon <= 360; lon += 5) {
            const a = (lon * Math.PI) / 180;
            const [px, py] = tp([r * Math.cos(a), y, r * Math.sin(a)]);
            lon === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.stroke();
    }
    for (let lon = 0; lon < 360; lon += 30) {
        const a = (lon * Math.PI) / 180;
        ctx.beginPath();
        for (let lat = -90; lat <= 90; lat += 5) {
            const y = SPHERE_R * Math.sin((lat * Math.PI) / 180);
            const r = Math.sqrt(Math.max(SPHERE_R * SPHERE_R - y * y, 0));
            const [px, py] = tp([r * Math.cos(a), y, r * Math.sin(a)]);
            lat === -90 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
        }
        ctx.stroke();
    }
    ctx.restore();

    // Project all nodes and sort back-to-front
    type Proj = RenderNode & { px: number; py: number; pz: number };
    const projected: Proj[] = renderNodes.map((n) => {
        const [px, py, pz] = tp(n.pos3);
        return { ...n, px, py, pz };
    });
    projected.sort((a, b) => a.pz - b.pz);

    // Graph edges (persisted ↔ persisted) — draw first
    for (const edge of renderEdges) {
        if (edge.kind !== 'graph') continue;
        const [fx, fy] = tp(edge.from);
        const [tx, ty] = tp(edge.to);
        ctx.beginPath();
        ctx.moveTo(fx, fy);
        ctx.lineTo(tx, ty);
        ctx.strokeStyle = edge.highlighted ? 'rgba(148,163,184,0.65)' : 'rgba(148,163,184,0.18)';
        ctx.lineWidth = (edge.highlighted ? 1.5 : 0.8) * dpr;
        ctx.setLineDash([]);
        ctx.stroke();
    }

    // Reference edges (act → persisted) — dashed blue
    for (const edge of renderEdges) {
        if (edge.kind !== 'reference') continue;
        const [fx, fy] = tp(edge.from);
        const [tx, ty] = tp(edge.to);
        ctx.beginPath();
        ctx.moveTo(fx, fy);
        ctx.lineTo(tx, ty);
        ctx.strokeStyle = edge.highlighted ? 'rgba(96,165,250,0.72)' : 'rgba(96,165,250,0.22)';
        ctx.lineWidth = (edge.highlighted ? 1.5 : 0.8) * dpr;
        ctx.setLineDash([3 * dpr, 2 * dpr]);
        ctx.stroke();
    }
    ctx.setLineDash([]);

    // Node cards
    ctx.save();
    ctx.scale(dpr, dpr);

    for (const node of projected) {
        const lx = node.px / dpr;
        const ly = node.py / dpr;
        const backFace = node.pz < -SPHERE_R * 0.1;
        const alpha = backFace ? 0.32 : 1.0;
        const isHovered = node.id === hoverId;

        const nw = node.kind === 'persisted' ? P_W : A_W;
        const nh = node.kind === 'persisted' ? P_H : A_H;
        const nr = node.kind === 'persisted' ? P_R : A_R;
        const x = lx - nw / 2, y = ly - nh / 2;

        ctx.globalAlpha = alpha;

        if (node.kind === 'persisted') {
            const hue = node.hue;
            const lightness = node.isSelected ? 50 : isHovered ? 48 : 30;

            if (node.isSelected || isHovered) {
                ctx.shadowColor = `hsla(${hue},75%,65%,0.55)`;
                ctx.shadowBlur = node.isSelected ? 14 : 8;
            }
            roundRect(ctx, x, y, nw, nh, nr);
            ctx.fillStyle = `hsl(${hue},55%,${lightness}%)`;
            ctx.fill();
            ctx.shadowBlur = 0;
            roundRect(ctx, x, y, nw, nh, nr);
            ctx.strokeStyle = node.isSelected
                ? `hsla(${hue},80%,75%,0.9)`
                : isHovered ? `hsla(${hue},60%,65%,0.7)`
                    : `hsla(${hue},45%,50%,0.45)`;
            ctx.lineWidth = node.isSelected ? 1.5 : 1;
            ctx.stroke();

            ctx.fillStyle = backFace ? 'rgba(255,255,255,0.45)' : 'rgba(255,255,255,0.92)';
            ctx.font = `${node.isSelected ? 600 : 400} 10px -apple-system,system-ui,sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(truncate(node.label), lx, ly);

        } else {
            const [sh, ss, sl] = node.actStage === 'ready'
                ? [210, 78, 42] : node.actStage === 'thinking' ? [268, 68, 40] : [215, 20, 35];

            if (node.isSelected || isHovered) {
                ctx.shadowColor = `hsla(${sh},80%,65%,0.55)`;
                ctx.shadowBlur = node.isSelected ? 14 : 8;
            }
            roundRect(ctx, x, y, nw, nh, nr);
            ctx.fillStyle = `hsl(${sh},${ss}%,${sl}%)`;
            ctx.fill();
            ctx.shadowBlur = 0;
            roundRect(ctx, x, y, nw, nh, nr);
            ctx.strokeStyle = node.isSelected
                ? `hsla(${sh},85%,78%,0.9)` : `hsla(${sh},60%,65%,0.5)`;
            ctx.lineWidth = node.isSelected ? 1.5 : 1;
            ctx.setLineDash(node.actStage === 'thinking' ? [3, 2] : []);
            ctx.stroke();
            ctx.setLineDash([]);

            ctx.fillStyle = `rgba(255,255,255,${backFace ? 0.4 : 0.88})`;
            ctx.font = `500 10px -apple-system,system-ui,sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(truncate(node.label), lx, ly);
        }

        ctx.globalAlpha = 1;
        ctx.shadowBlur = 0;
    }

    ctx.restore();
}

// ── Main component ────────────────────────────────────────────────────────────
type SphereViewerProps = { className?: string };

export function SphereViewer({ className }: SphereViewerProps) {
    const persistedNodes = useGraphStore((s) => s.persistedNodes) as GraphNodeBase[];
    const persistedEdges = useGraphStore((s) => s.persistedEdges);
    const actNodes = useGraphStore((s) => s.actNodes) as GraphNodeBase[];
    const expandedBranchNodeIds = useGraphStore((s) => s.expandedBranchNodeIds);
    const selectedNodeIds = useGraphStore((s) => s.selectedNodeIds);
    const setSelectedNodes = useGraphStore((s) => s.setSelectedNodes);

    const canvasRef = useRef<HTMLCanvasElement>(null);
    const rotYRef = useRef(0.3);
    const rotXRef = useRef(0.15);
    const dragRef = useRef<{ x: number; y: number } | null>(null);
    const autoRotRef = useRef(true);
    const rafRef = useRef<number>(0);
    const hoverIdRef = useRef<string | null>(null);
    const [, forceRender] = useState(0);

    const { rootIds, childrenByParent } = useMemo(
        () => buildVisibleHierarchy(persistedNodes, persistedEdges, expandedBranchNodeIds),
        [persistedNodes, persistedEdges, expandedBranchNodeIds],
    );

    // Hue per root subtree
    const hueById = useMemo(() => {
        const map = new Map<string, number>();
        function assign(id: string, hue: number) {
            map.set(id, hue);
            (childrenByParent.get(id) ?? []).forEach((c) => assign(c, hue));
        }
        rootIds.forEach((id, i) => assign(id, ROOT_HUES[i % ROOT_HUES.length]));
        return map;
    }, [rootIds, childrenByParent]);

    // Build layout edges: persisted graph edges + parent-child hierarchy edges (weight 2)
    const layoutEdges = useMemo((): LayoutEdge[] => {
        const edges: LayoutEdge[] = persistedEdges.map((e) => ({
            source: e.source, target: e.target, weight: 1,
        }));
        // Parent-child edges (weight 2 = stronger pull)
        for (const [parentId, children] of childrenByParent.entries()) {
            for (const childId of children) {
                edges.push({ source: parentId, target: childId, weight: 2 });
            }
        }
        return edges;
    }, [persistedEdges, childrenByParent]);

    // Run spherical force layout — re-runs when graph topology changes
    const persistedPositions = useMemo(() => {
        const ids = persistedNodes.map((n) => n.id);
        return layoutSphericalForce(ids, layoutEdges);
    }, [persistedNodes, layoutEdges]);

    // Act node interior positions (centroid of referenced persisted surface positions)
    const actPositions = useMemo(() => {
        const map = new Map<string, Vec3>();
        actNodes.forEach((node, idx) => {
            const refs: string[] = Array.isArray(node.data?.referencedNodeIds)
                ? (node.data.referencedNodeIds as unknown[]).filter((v): v is string => typeof v === 'string')
                : [];
            const refPos = refs.map((id) => persistedPositions.get(id)).filter((p): p is Vec3 => !!p);
            if (refPos.length > 0) {
                map.set(node.id, [
                    refPos.reduce((s, p) => s + p[0], 0) / refPos.length * ACT_INNER,
                    refPos.reduce((s, p) => s + p[1], 0) / refPos.length * ACT_INNER,
                    refPos.reduce((s, p) => s + p[2], 0) / refPos.length * ACT_INNER,
                ]);
            } else {
                const a = (idx / Math.max(actNodes.length, 1)) * Math.PI * 2;
                const r = SPHERE_R * 0.28;
                map.set(node.id, [r * Math.cos(a), 0, r * Math.sin(a)]);
            }
        });
        return map;
    }, [actNodes, persistedPositions]);

    const selectedSet = useMemo(() => new Set(selectedNodeIds), [selectedNodeIds]);

    const renderNodes = useMemo((): RenderNode[] => [
        ...persistedNodes.map((n) => ({
            id: n.id,
            label: typeof n.data?.label === 'string' ? n.data.label : n.id,
            pos3: persistedPositions.get(n.id) ?? ([0, 0, 0] as Vec3),
            kind: 'persisted' as const,
            hue: hueById.get(n.id) ?? 210,
            isSelected: selectedSet.has(n.id),
        })),
        ...actNodes.map((n) => ({
            id: n.id,
            label: typeof n.data?.label === 'string' ? n.data.label : n.id,
            pos3: actPositions.get(n.id) ?? ([0, 0, 0] as Vec3),
            kind: 'act' as const,
            hue: 210,
            isSelected: selectedSet.has(n.id),
            actStage: typeof (n.data as Record<string, unknown>)?.actStage === 'string'
                ? (n.data as Record<string, unknown>).actStage as string : undefined,
        })),
    ], [persistedNodes, actNodes, persistedPositions, actPositions, hueById, selectedSet]);

    const renderEdges = useMemo((): RenderEdge[] => {
        const edges: RenderEdge[] = [];
        // Persisted graph edges
        for (const e of persistedEdges) {
            const from = persistedPositions.get(e.source);
            const to = persistedPositions.get(e.target);
            if (from && to) edges.push({
                from, to, kind: 'graph',
                highlighted: selectedSet.has(e.source) || selectedSet.has(e.target),
            });
        }
        // Act → persisted reference edges
        for (const n of actNodes) {
            const from = actPositions.get(n.id);
            if (!from) continue;
            const refs: string[] = Array.isArray(n.data?.referencedNodeIds)
                ? (n.data.referencedNodeIds as unknown[]).filter((v): v is string => typeof v === 'string')
                : [];
            for (const refId of refs) {
                const to = persistedPositions.get(refId);
                if (to) edges.push({
                    from, to, kind: 'reference',
                    highlighted: selectedSet.has(n.id) || selectedSet.has(refId),
                });
            }
        }
        return edges;
    }, [persistedEdges, actNodes, persistedPositions, actPositions, selectedSet]);

    // Animation loop
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        function frame() {
            if (!canvas || !ctx) return;
            const dpr = window.devicePixelRatio ?? 1;
            if (autoRotRef.current && !dragRef.current) rotYRef.current += AUTO_ROTATE_SPEED;
            drawFrame(ctx, canvas.width, canvas.height, renderNodes, renderEdges,
                rotYRef.current, rotXRef.current, hoverIdRef.current, dpr);
            rafRef.current = requestAnimationFrame(frame);
        }
        rafRef.current = requestAnimationFrame(frame);
        return () => cancelAnimationFrame(rafRef.current);
    }, [renderNodes, renderEdges]);

    // Resize observer
    useEffect(() => {
        const canvas = canvasRef.current;
        const parent = canvas?.parentElement;
        if (!canvas || !parent) return;
        const ro = new ResizeObserver((entries) => {
            for (const e of entries) {
                const dpr = window.devicePixelRatio ?? 1;
                canvas.width = e.contentRect.width * dpr;
                canvas.height = e.contentRect.height * dpr;
                canvas.style.width = `${e.contentRect.width}px`;
                canvas.style.height = `${e.contentRect.height}px`;
            }
        });
        ro.observe(parent);
        return () => ro.disconnect();
    }, []);

    // Hit-test: find node whose projected rect contains the mouse
    const hitTest = useCallback((ox: number, oy: number): string | null => {
        const canvas = canvasRef.current;
        if (!canvas) return null;
        const dpr = window.devicePixelRatio ?? 1;
        const cx = canvas.width / 2, cy = canvas.height / 2;
        const px = ox * dpr, py = oy * dpr;
        let best: string | null = null, bestZ = -Infinity;
        for (const node of renderNodes) {
            const rot = rotX(rotY(node.pos3, rotYRef.current), rotXRef.current);
            const z = rot[2] + FOV;
            const scale = FOV / Math.max(z, 1);
            const sx = cx + rot[0] * scale;
            const sy = cy - rot[1] * scale;
            const nw = (node.kind === 'persisted' ? P_W : A_W) * dpr;
            const nh = (node.kind === 'persisted' ? P_H : A_H) * dpr;
            if (px >= sx - nw / 2 && px <= sx + nw / 2 && py >= sy - nh / 2 && py <= sy + nh / 2) {
                if (rot[2] > bestZ) { bestZ = rot[2]; best = node.id; }
            }
        }
        return best;
    }, [renderNodes]);

    const onMouseDown = useCallback((e: React.MouseEvent) => {
        autoRotRef.current = false;
        dragRef.current = { x: e.clientX, y: e.clientY };
    }, []);

    const onMouseMove = useCallback((e: React.MouseEvent) => {
        if (dragRef.current) {
            rotYRef.current += (e.clientX - dragRef.current.x) * 0.005;
            rotXRef.current = Math.max(-Math.PI / 2, Math.min(Math.PI / 2,
                rotXRef.current + (e.clientY - dragRef.current.y) * 0.005));
            dragRef.current = { x: e.clientX, y: e.clientY };
        }
        const hit = hitTest(e.nativeEvent.offsetX, e.nativeEvent.offsetY);
        if (hit !== hoverIdRef.current) { hoverIdRef.current = hit; forceRender((n) => n + 1); }
    }, [hitTest]);

    const onMouseUp = useCallback(() => { dragRef.current = null; }, []);
    const onMouseLeave = useCallback(() => {
        dragRef.current = null; hoverIdRef.current = null;
        autoRotRef.current = true; forceRender((n) => n + 1);
    }, []);
    const onClick = useCallback((e: React.MouseEvent) => {
        const hit = hitTest(e.nativeEvent.offsetX, e.nativeEvent.offsetY);
        if (hit) setSelectedNodes([hit]);
    }, [hitTest, setSelectedNodes]);

    const cursor = hoverIdRef.current ? 'pointer' : dragRef.current ? 'grabbing' : 'grab';

    return (
        <div className={className} style={{ width: '100%', height: '100%', background: '#060e1c', position: 'relative' }}>
            <canvas
                ref={canvasRef}
                style={{ display: 'block', cursor, width: '100%', height: '100%' }}
                onMouseDown={onMouseDown}
                onMouseMove={onMouseMove}
                onMouseUp={onMouseUp}
                onMouseLeave={onMouseLeave}
                onClick={onClick}
            />
            <div style={{
                position: 'absolute', bottom: 12, left: 0, right: 0,
                textAlign: 'center', fontSize: 11, color: 'rgba(148,163,184,0.5)',
                pointerEvents: 'none', userSelect: 'none',
            }}>
                drag to rotate · click to select
            </div>
        </div>
    );
}
