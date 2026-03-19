"use client";

import React from 'react';
import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useGraphStore } from '../store';

/**
 * Toolbar for general graph actions, positioned in the canvas area.
 */
export function GraphToolbar() {
    const clearAllFocus = useGraphStore((state) => state.clearAllFocus);
    const activeNodeId = useGraphStore((state) => state.activeNodeId);
    const selectedCount = useGraphStore((state) => state.selectedNodeIds.length);
    const expandedCount = useGraphStore((state) => state.expandedNodeIds.length);

    const hasFocus = activeNodeId || selectedCount > 0 || expandedCount > 0;

    if (!hasFocus) return null;

    return (
        <div className="absolute bottom-20 left-4 z-20 flex flex-col gap-2">
            <Button
                variant="outline"
                size="icon"
                className="h-10 w-10 rounded-full bg-white/90 shadow-md hover:bg-rose-50 hover:text-rose-600 hover:border-rose-200 transition-all duration-300 backdrop-blur-sm"
                onClick={() => clearAllFocus()}
                title="Clear all focus & selection"
            >
                <Trash2 className="h-5 w-5" />
            </Button>
        </div>
    );
}
