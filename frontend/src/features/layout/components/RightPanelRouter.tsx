"use client";

import React from 'react';
import { usePanelStore } from '../store/panel-store';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function RightPanelRouter() {
    const { isOpen, mode, closePanel, selectedNodeId } = usePanelStore();

    if (!isOpen) return null;

    return (
        <div className="h-full w-full bg-background border-l flex flex-col relative">
            <div className="flex items-center justify-between p-2 border-b">
                <span className="text-sm font-medium capitalize px-2">
                    {mode.replace('-', ' ')}
                </span>
                <Button variant="ghost" size="icon" onClick={closePanel} className="h-8 w-8">
                    <X className="h-4 w-4" />
                </Button>
            </div>

            <div className="flex-1 overflow-auto p-4">
                {mode === 'node-detail' && (
                    <div className="text-sm">
                        <h3 className="font-semibold mb-2">Node Detail</h3>
                        <p className="text-muted-foreground">Detailed view for node: {selectedNodeId || 'None'}</p>
                    </div>
                )}

                {mode === 'topic-activity' && (
                    <div className="text-sm">
                        <h3 className="font-semibold mb-2">Topic Activity</h3>
                        <p className="text-muted-foreground">Activity timeline placeholder</p>
                    </div>
                )}

                {mode === 'review-inbox' && (
                    <div className="text-sm">
                        <h3 className="font-semibold mb-2">Review Inbox</h3>
                        <p className="text-muted-foreground">Review ops area placeholder</p>
                    </div>
                )}
            </div>
        </div>
    );
}
