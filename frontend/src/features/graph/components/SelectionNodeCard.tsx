"use client";

import React from 'react';
import { Handle, Position, NodeProps, Node } from '@xyflow/react';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Check, Circle } from 'lucide-react';
import { useAgentInteractionStore } from '@/features/agentInteraction/store/interactionStore';
import { UiSelectionOption, SelectionMode, SelectionStatus } from '@/features/agentInteraction/types';

type SelectionNodeData = UiSelectionOption & {
    groupId: string;
    selectionMode: SelectionMode;
    groupStatus: SelectionStatus;
};

export type SelectionNode = Node<Record<string, unknown>, 'selectionNode'>;

export function SelectionNodeCard({ data, isConnectable }: NodeProps<Node>) {
    const nodeData = data as unknown as SelectionNodeData;
    const { toggleOptionSelection } = useAgentInteractionStore();
    const isReadOnly = nodeData.groupStatus !== 'pending';

    const handleSelect = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (!isReadOnly) {
            toggleOptionSelection(nodeData.groupId, nodeData.option_id);
        }
    };

    // Styling based on state and mode
    const baseClasses = "w-[240px] shadow-sm transition-colors cursor-pointer border-dashed border-2";
    let stateClasses = "bg-amber-50/50 border-amber-200 hover:border-amber-400";

    if (nodeData.selected) {
        stateClasses = "bg-amber-100 border-amber-500 ring-2 ring-amber-500 ring-offset-2";
    }

    if (isReadOnly) {
        if (nodeData.groupStatus === 'selected' && nodeData.selected) {
            stateClasses = "bg-muted border-primary/50 opacity-80 cursor-default";
        } else {
            stateClasses = "bg-muted/50 border-muted opacity-50 cursor-default";
        }
    }

    return (
        <>
            <Handle type="target" position={Position.Top} isConnectable={isConnectable} className="w-2 h-2 !bg-amber-400" />
            <Card className={`${baseClasses} ${stateClasses}`} onClick={(e: React.MouseEvent) => handleSelect(e)}>
                <CardHeader className="p-3 pb-2 flex flex-row items-center justify-between gap-2">
                    <CardTitle className="text-sm font-medium leading-tight">
                        {nodeData.label}
                    </CardTitle>
                    {nodeData.selected && <Badge variant="default" className="text-[10px] px-1 py-0 bg-amber-600 hover:bg-amber-600">Selected</Badge>}
                    {!nodeData.selected && <Badge variant="outline" className="text-[10px] px-1 py-0 text-amber-700 border-amber-200">Select</Badge>}
                </CardHeader>
                {nodeData.content_md && (
                    <CardContent className="p-3 pt-0 text-xs text-muted-foreground line-clamp-3">
                        {nodeData.content_md}
                    </CardContent>
                )}
                <CardFooter className="p-3 pt-0 flex justify-end">
                    <div className="flex items-center text-xs text-amber-700 font-medium gap-1">
                        {nodeData.selectionMode === 'single' ? (
                            nodeData.selected ? <Circle className="w-4 h-4 fill-amber-600 text-amber-600" /> : <Circle className="w-4 h-4" />
                        ) : (
                            nodeData.selected ? <Check className="w-4 h-4" /> : <div className="w-4 h-4 border rounded-sm border-amber-400" />
                        )}
                        {!isReadOnly && <span className="ml-1 opacity-70">Click to {nodeData.selected ? 'deselect' : 'select'}</span>}
                    </div>
                </CardFooter>
            </Card>
            <Handle type="source" position={Position.Bottom} isConnectable={isConnectable} className="w-2 h-2 !bg-amber-400" />
        </>
    );
}
