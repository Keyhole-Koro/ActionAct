import { useState, useEffect } from "react";

const STORAGE_KEY = "dashboard:favoritesLimit";
const DEFAULT_LIMIT = 6;

export function useFavoritesLimit() {
    const [limit, setLimitState] = useState<number>(DEFAULT_LIMIT);

    useEffect(() => {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored !== null) {
            const parsed = parseInt(stored, 10);
            if (!isNaN(parsed) && parsed > 0) setLimitState(parsed);
        }
    }, []);

    const setLimit = (value: number) => {
        const clamped = Math.max(1, value);
        setLimitState(clamped);
        localStorage.setItem(STORAGE_KEY, String(clamped));
    };

    return { limit, setLimit };
}
