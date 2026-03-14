"use client";

import React from 'react';
import { usePanelStore } from '../store/panel-store';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { NodeDetailPanel } from '@/features/nodeDetail/components/NodeDetailPanel';

export function RightPanelRouter() {
    const { isOpen, mode: panelMode, closePanel, selectedNodeId } = usePanelStore();

    if (!isOpen) return null;

    return (
        <div className="h-full flex flex-col bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
            {/* Router Header */}
            <div className="flex items-center justify-between p-2 border-b">
                <span className="text-sm font-medium capitalize px-2">
                    {panelMode.replace('-', ' ')}
                </span>
                <Button variant="ghost" size="icon" onClick={closePanel} className="h-8 w-8">
                    <X className="h-4 w-4" />
                </Button>
            </div>

            {/* Content routing based on mode */}
            <div className="flex-1 overflow-hidden">
                {panelMode === 'node-detail' && <NodeDetailPanel />}
                {panelMode === 'activity' && (
                    <div className="p-4 flex flex-col items-center justify-center h-full text-center text-muted-foreground">
                        Activity panel is under construction.
                    </div>
                )}
                {panelMode === 'review' && (
                    <div className="p-4 flex flex-col items-center justify-center h-full text-center text-muted-foreground">
                        Review Inbox is under construction.
                    </div>
                )}
            </div>
        </div>
    );
}
