"use client";

import React, { useEffect, useMemo, useState } from 'react';
import { Node } from '@xyflow/react';

import { ScrollArea } from '@/components/ui/scroll-area';
import { MarkdownPane } from '@/features/nodeMarkdown/components/MarkdownPane';
import { ActionOrganizeBar } from '@/features/action/actionOrganize/components/ActionOrganizeBar';
import { NodeSummaryCard } from './NodeSummaryCard';
import { NodeEvidenceList } from './NodeEvidenceList';
import { organizeService } from '@/services/organize';
import type { EvidenceRef } from '@/services/organize/port';
import { useRunContextStore } from '@/features/context/store/run-context-store';
import { useGraphStore } from '@/features/graph/store';

export function NodeDetailPanel() {
    const { activeNodeId, persistedNodes, actNodes, setActiveNode } = useGraphStore();
    const { workspaceId, topicId } = useRunContextStore();
    const [evidenceState, setEvidenceState] = useState<{ nodeId: string | null; refs: EvidenceRef[] | undefined }>({
        nodeId: null,
        refs: undefined,
    });

    const activeNode = useMemo(
        () => (activeNodeId ? [...persistedNodes, ...actNodes].find((node: Node) => node.id === activeNodeId) ?? null : null),
        [actNodes, activeNodeId, persistedNodes],
    );

    const data = activeNode?.data ?? {};
    const nodeTopicId = (data.topicId as string) || topicId;
    const title = (data.label as string) || 'Untitled';
    const kindLabel = typeof data.kind === 'string' ? data.kind : undefined;
    const contentMd = (data.contentMd as string) || '';
    const contextSummary = data.contextSummary as string | undefined;
    const detailHtml = data.detailHtml as string | undefined;
    const nodeSource = (data.nodeSource as 'persisted' | 'act' | undefined) ?? 'persisted';

    useEffect(() => {
        if (!activeNodeId || !activeNode || nodeSource !== 'persisted') {
            return;
        }

        return organizeService.subscribeNodeEvidence(workspaceId, nodeTopicId, activeNode.id, (nextEvidenceRefs) => {
            setEvidenceState({ nodeId: activeNode.id, refs: nextEvidenceRefs });
        });
    }, [activeNode, activeNodeId, nodeSource, nodeTopicId, workspaceId]);

    const evidenceRefs = nodeSource === 'persisted' && evidenceState.nodeId === activeNode?.id
        ? evidenceState.refs
        : undefined;

    if (!activeNodeId) {
        return (
            <div className="flex flex-col items-center justify-center p-6 h-full text-center text-muted-foreground">
                Select a node on the canvas to view its details.
            </div>
        );
    }

    if (!activeNode) {
        return (
            <div className="flex flex-col items-center justify-center p-6 h-full text-center text-muted-foreground">
                Node not found.
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full bg-background border-l">
            <div className="p-4 border-b flex-shrink-0 bg-muted/20">
                <div className="flex items-center justify-between mb-1">
                    <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        {kindLabel ?? 'node'}
                    </div>
                    <ActionOrganizeBar
                        workspaceId={workspaceId}
                        topicId={nodeTopicId}
                        nodeId={activeNode.id}
                        nodeSource={nodeSource}
                        currentTitle={title}
                        onDeleteSuccess={() => setActiveNode(null)}
                    />
                </div>
                <h2 className="text-xl font-bold mt-1 pr-12">{title}</h2>
                <div className="text-[10px] text-muted-foreground mt-2 font-mono opacity-60">ID: {activeNode.id}</div>
            </div>

            <ScrollArea className="flex-1">
                <div className="p-6">
                    <NodeSummaryCard contextSummary={contextSummary} detailHtml={detailHtml} />

                    {contentMd ? (
                        <MarkdownPane content={contentMd} />
                    ) : (
                        (!contextSummary && !detailHtml) && (
                            <div className="text-sm italic text-muted-foreground py-4">No content generated yet.</div>
                        )
                    )}

                    <NodeEvidenceList evidenceRefs={evidenceRefs} />
                </div>
            </ScrollArea>
        </div>
    );
}
