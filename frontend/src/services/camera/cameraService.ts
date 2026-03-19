import { Node } from '@xyflow/react';
import { easing } from './easing';

/**
 * Configuration for camera animations
 */
export const CAMERA_CONFIG = {
    // Single node focus
    singleNodeZoomMin: 0.75,
    singleNodeZoomMax: 1.3,
    singleNodeDuration: 320,

    // Multiple node fit view
    fitViewDuration: 180,
    fitViewPadding: 0.14,
    fitViewZoomMin: 0.2,
    fitViewZoomMax: 1.2,

    // Node-specific offsets (to center on content, not top-left)
    nodeOffsetX: 170,
    nodeOffsetY: 90,

    // Double-click focus
    doubleClickDuration: 300,
    doubleClickZoomMin: 0.9,

    // Radial view animation
    radialAnimationStepFactor: 0.12,
} as const;

/**
 * Bounding box for calculating viewport
 */
export interface BoundingBox {
    x: number;
    y: number;
    width: number;
    height: number;
}

/**
 * Get the bounding box of a single node including its dimensions
 */
export function getNodeBoundingBox(
    node: Node<Record<string, unknown>>,
    nodeDimensions: { width: number; height: number },
): BoundingBox {
    return {
        x: node.position.x,
        y: node.position.y,
        width: nodeDimensions.width,
        height: nodeDimensions.height,
    };
}

/**
 * Get the bounding box that encompasses multiple nodes
 */
export function getBoundingBoxForNodes(
    nodes: Array<{ position: { x: number; y: number }; width: number; height: number }>,
): BoundingBox {
    if (nodes.length === 0) {
        return { x: 0, y: 0, width: 0, height: 0 };
    }

    let minX = nodes[0].position.x;
    let minY = nodes[0].position.y;
    let maxX = nodes[0].position.x + nodes[0].width;
    let maxY = nodes[0].position.y + nodes[0].height;

    for (let i = 1; i < nodes.length; i++) {
        const node = nodes[i];
        minX = Math.min(minX, node.position.x);
        minY = Math.min(minY, node.position.y);
        maxX = Math.max(maxX, node.position.x + node.width);
        maxY = Math.max(maxY, node.position.y + node.height);
    }

    return {
        x: minX,
        y: minY,
        width: maxX - minX,
        height: maxY - minY,
    };
}

/**
 * Calculate optimal zoom level to fit bounding box in viewport
 * Ensures the content occupies 60-80% of viewable area
 */
export function calculateOptimalZoom(
    boundingBox: BoundingBox,
    viewportWidth: number,
    viewportHeight: number,
    minZoom: number = CAMERA_CONFIG.fitViewZoomMin,
    maxZoom: number = CAMERA_CONFIG.fitViewZoomMax,
): number {
    if (boundingBox.width === 0 || boundingBox.height === 0) {
        return 1;
    }

    // Target 70% of viewport
    const targetCoverageRatio = 0.7;
    const availableWidth = viewportWidth * targetCoverageRatio;
    const availableHeight = viewportHeight * targetCoverageRatio;

    const zoomX = availableWidth / boundingBox.width;
    const zoomY = availableHeight / boundingBox.height;

    // Use smaller zoom to ensure both dimensions fit
    const optimalZoom = Math.min(zoomX, zoomY);

    return Math.max(minZoom, Math.min(optimalZoom, maxZoom));
}

/**
 * Calculate center position for a bounding box
 */
export function calculateCenterPosition(boundingBox: BoundingBox): { x: number; y: number } {
    return {
        x: boundingBox.x + boundingBox.width / 2,
        y: boundingBox.y + boundingBox.height / 2,
    };
}

/**
 * Adjust zoom level based on current zoom
 * Ensures smooth transitions between different zoom levels
 */
export function clampZoom(currentZoom: number, minZoom: number, maxZoom: number): number {
    return Math.min(Math.max(currentZoom, minZoom), maxZoom);
}

/**
 * Prepare camera animation options for ReactFlow's setCenter
 */
export interface CameraAnimationOptions {
    duration: number;
    zoom: number;
    easingFunction?: (t: number) => number;
}

/**
 * Create animation options for focusing a single node
 */
export function createSingleNodeFocusOptions(
    currentZoom: number,
    override?: Partial<typeof CAMERA_CONFIG>,
): CameraAnimationOptions {
    const config = { ...CAMERA_CONFIG, ...override };
    const nextZoom = clampZoom(currentZoom, config.singleNodeZoomMin, config.singleNodeZoomMax);

    return {
        duration: config.singleNodeDuration,
        zoom: nextZoom,
        easingFunction: easing.easeInOutCubic,
    };
}

/**
 * Create animation options for fitting multiple nodes
 */
export function createFitViewOptions(override?: Partial<typeof CAMERA_CONFIG>): Omit<CameraAnimationOptions, 'zoom'> {
    const config = { ...CAMERA_CONFIG, ...override };

    return {
        duration: config.fitViewDuration,
        easingFunction: easing.easeInOutCubic,
    };
}
