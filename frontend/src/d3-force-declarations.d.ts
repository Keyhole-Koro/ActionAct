// Minimal type declarations for d3-force.
// Replace with the real package types once `docker compose build` picks up the
// `d3-force` entry in package.json.
declare module 'd3-force' {
    export interface SimulationNodeDatum {
        index?: number;
        x?: number;
        y?: number;
        vx?: number;
        vy?: number;
        fx?: number | null;
        fy?: number | null;
    }

    export interface SimulationLinkDatum<N extends SimulationNodeDatum> {
        source: N | string | number;
        target: N | string | number;
        index?: number;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    type AnyForce = any;

    export interface Simulation<N extends SimulationNodeDatum> {
        force(name: string, force?: AnyForce): this;
        stop(): this;
        tick(iterations?: number): this;
        nodes(): N[];
        nodes(nodes: N[]): this;
    }

    export function forceSimulation<N extends SimulationNodeDatum>(nodes?: N[]): Simulation<N>;

    export interface ManyBodyForce<N extends SimulationNodeDatum> {
        strength(s: number | ((node: N) => number)): this;
        distanceMax(d: number): this;
    }
    export function forceManyBody<N extends SimulationNodeDatum>(): ManyBodyForce<N>;

    export interface LinkForce<N extends SimulationNodeDatum, L extends SimulationLinkDatum<N>> {
        id(fn: (node: N) => string): this;
        distance(d: number | ((link: L) => number)): this;
        strength(s: number | ((link: L) => number)): this;
        iterations(n: number): this;
        links(): L[];
    }
    export function forceLink<N extends SimulationNodeDatum, L extends SimulationLinkDatum<N>>(links?: L[]): LinkForce<N, L>;

    export interface CollideForce<N extends SimulationNodeDatum> {
        radius(r: number | ((node: N) => number)): this;
        iterations(n: number): this;
        strength(s: number): this;
    }
    export function forceCollide<N extends SimulationNodeDatum>(radius?: number | ((node: N) => number)): CollideForce<N>;

    export interface PositioningForce<N extends SimulationNodeDatum> {
        strength(s: number | ((node: N) => number)): this;
        x(x: number | ((node: N) => number)): this;
        y(y: number | ((node: N) => number)): this;
    }
    export function forceX<N extends SimulationNodeDatum>(x?: number | ((node: N) => number)): PositioningForce<N>;
    export function forceY<N extends SimulationNodeDatum>(y?: number | ((node: N) => number)): PositioningForce<N>;
}
