"use client";

import React, { useEffect, useMemo, useState } from 'react';
import { Node } from '@xyflow/react';

import { ScrollArea } from '@/components/ui/scroll-area';
import { RichTextPane } from '@/features/nodeMarkdown/components/RichTextPane';
import { ActionOrganizeBar } from '@/features/action/actionOrganize/components/ActionOrganizeBar';
import { NodeSummaryCard } from './NodeSummaryCard';
import { NodeEvidenceList } from './NodeEvidenceList';
import { organizeService } from '@/services/organize';
import type { EvidenceRef } from '@/services/organize/port';
import { useRunContextStore } from '@/features/context/store/run-context-store';
import { useGraphStore } from '@/features/graph/store';
import { safeString, safeOptionalString } from '@/features/graph/utils/safeData';

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

    const data = (activeNode?.data ?? {}) as Record<string, unknown>;
    const nodeTopicId = safeString(data, 'topicId', topicId);
    const title = safeString(data, 'label', 'Untitled');
    const kindLabel = safeOptionalString(data, 'kind');
    const contentMd = safeString(data, 'contentMd');
    const contextSummary = safeOptionalString(data, 'contextSummary');
    const detailHtml = safeOptionalString(data, 'detailHtml');
    const nodeSource = (safeOptionalString(data, 'nodeSource') as 'persisted' | 'act' | undefined) ?? 'persisted';

    // Evidence subscription — deps are primitives only (no object ref) to avoid flickering
    useEffect(() => {
        if (!activeNodeId || nodeSource !== 'persisted') {
            return;
        }

        return organizeService.subscribeNodeEvidence(workspaceId, nodeTopicId, activeNodeId, (nextEvidenceRefs) => {
            setEvidenceState({ nodeId: activeNodeId, refs: nextEvidenceRefs });
        });
    }, [activeNodeId, nodeSource, nodeTopicId, workspaceId]);

    const evidenceRefs = nodeSource === 'persisted' && evidenceState.nodeId === activeNodeId
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
        <div className="flex flex-col h-full bg-background">
            <div className="p-4 border-b flex-shrink-0 bg-muted/20">
                <div className="flex items-center justify-between mb-1">
                    <div className="text-xs font-medium text-muted-foreground">
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
                        <RichTextPane
                            content={contentMd}
                            markdownClassName="prose prose-sm dark:prose-invert max-w-none prose-headings:font-medium prose-a:text-primary"
                        />
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
