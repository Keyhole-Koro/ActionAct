/**
 * Easing functions for smooth camera animations
 */

export const easing = {
    /**
     * Cubic ease-in-out: smoothly accelerates and decelerates
     * Used for most camera animations
     */
    easeInOutCubic: (t: number): number => {
        return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    },

    /**
     * Cubic ease-out: decelerates smoothly
     * Used for ending animations
     */
    easeOutCubic: (t: number): number => {
        return 1 - Math.pow(1 - t, 3);
    },

    /**
     * Cubic ease-in: accelerates smoothly
     * Used for starting animations
     */
    easeInCubic: (t: number): number => {
        return t * t * t;
    },

    /**
     * Quad ease-in-out: faster than cubic, used for quick transitions
     */
    easeInOutQuad: (t: number): number => {
        return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    },

    /**
     * Linear: constant speed (no easing)
     */
    linear: (t: number): number => {
        return t;
    },
};

/**
 * Interpolate between two values using an easing function
 */
export function interpolate(
    from: number,
    to: number,
    progress: number,
    easingFn: (t: number) => number = easing.easeInOutCubic,
): number {
    return from + (to - from) * easingFn(progress);
}
