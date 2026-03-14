"use client";

import React from 'react';
import { useKnowledgeTreeStore } from '@/features/knowledgeTree/store';
import { MarkdownPane } from '@/features/nodeMarkdown/components/MarkdownPane';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Node } from '@xyflow/react';

import { ActionOrganizeBar } from '@/features/action/actionOrganize/components/ActionOrganizeBar';
import { NodeSummaryCard } from './NodeSummaryCard';
import { NodeEvidenceList } from './NodeEvidenceList';
import { EvidenceRef } from '@/services/organize/port';
import { useRunContextStore } from '@/features/context/store/run-context-store';

export function NodeDetailPanel() {
    const { activeNodeId, nodes, setActiveNode } = useKnowledgeTreeStore();
    const { workspaceId, topicId } = useRunContextStore();

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

    // Safely extract our custom A7 data fields from the generic ReactFlow node
    const data = activeNode.data || {};
    const title = (data.label as string) || 'Untitled';
    const typeLabel = (data.type as string) || 'concept';
    const contentMd = (data.contentMd as string) || '';
    const contextSummary = data.contextSummary as string | undefined;
    const detailHtml = data.detailHtml as string | undefined;
    const evidenceRefs = data.evidenceRefs as EvidenceRef[] | undefined;

    return (
        <div className="flex flex-col h-full bg-background border-l">
            {/* Node Header Summary */}
            <div className="p-4 border-b flex-shrink-0 bg-muted/20">
                <div className="flex items-center justify-between mb-1">
                    <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        {typeLabel}
                    </div>
                    {/* Action Organize Bar for Rename/Delete */}
                    <ActionOrganizeBar
                        workspaceId={workspaceId}
                        topicId={topicId}
                        nodeId={activeNode.id}
                        currentTitle={title}
                        onDeleteSuccess={() => setActiveNode(null)}
                    />
                </div>
                <h2 className="text-xl font-bold mt-1 pr-12">{title}</h2>
                <div className="text-[10px] text-muted-foreground mt-2 font-mono opacity-60">ID: {activeNode.id}</div>
            </div>

            {/* Scrollable Content Area */}
            <ScrollArea className="flex-1">
                <div className="p-6">
                    {/* A7 Summary Level */}
                    <NodeSummaryCard contextSummary={contextSummary} detailHtml={detailHtml} />

                    {/* Canonical Markdown Body */}
                    {contentMd ? (
                        <MarkdownPane content={contentMd} />
                    ) : (
                        (!contextSummary && !detailHtml) && (
                            <div className="text-sm italic text-muted-foreground py-4">No content generated yet.</div>
                        )
                    )}

                    {/* Evidence & References */}
                    <NodeEvidenceList evidenceRefs={evidenceRefs} />
                </div>
            </ScrollArea>
        </div>
    );
}
