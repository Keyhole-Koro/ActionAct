"use client";

import React from 'react';
import { useKnowledgeTreeStore } from '@/features/knowledgeTree/store';
import { MarkdownPane } from '@/features/nodeMarkdown/components/MarkdownPane';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Node } from '@xyflow/react';

export function NodeDetailPanel() {
    const { activeNodeId, nodes } = useKnowledgeTreeStore();

    if (!activeNodeId) {
        return (
            <div className="flex flex-col items-center justify-center p-6 h-full text-center text-muted-foreground">
                Select a node on the canvas to view its details.
            </div>
        );
    }

    const activeNode = nodes.find((n: Node) => n.id === activeNodeId);

    if (!activeNode) {
        return (
            <div className="flex flex-col items-center justify-center p-6 h-full text-center text-muted-foreground">
                Node not found.
            </div>
        );
    }

    const contentMd = activeNode.data?.contentMd as string || '';

    return (
        <div className="flex flex-col h-full bg-background border-l">
            {/* Node Header Summary */}
            <div className="p-4 border-b flex-shrink-0 bg-muted/20">
                <div className="text-xs font-semibold text-muted-foreground mb-1 uppercase tracking-wider">
                    {activeNode.data.type as string}
                </div>
                <h2 className="text-xl font-bold">{activeNode.data.label as string}</h2>
                <div className="text-xs text-muted-foreground mt-2 font-mono">ID: {activeNode.id}</div>
            </div>

            {/* Markdown Content Area */}
            <ScrollArea className="flex-1 p-6">
                <MarkdownPane content={contentMd} />
            </ScrollArea>
        </div>
    );
}
