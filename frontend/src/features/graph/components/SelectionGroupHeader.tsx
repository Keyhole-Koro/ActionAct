"use client";

import React from 'react';
import { Handle, Position, NodeProps, Node } from '@xyflow/react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Clock, CheckCircle2, XCircle, AlertCircle } from 'lucide-react';
import { useAgentInteractionStore } from '@/features/agentInteraction/store/interactionStore';
import { SelectionGroup, SelectionStatus } from '@/features/agentInteraction/types';

export type SelectionHeaderNode = Node<SelectionGroup, 'selectionHeader'>;

export function SelectionGroupHeader({ id, data }: NodeProps<SelectionHeaderNode>) {
    const { confirmSelection, clearSelection, cancelGroup } = useAgentInteractionStore();

    // Derived state
    const isPending = data.status === 'pending';
    const selectedCount = data.options.filter(opt => opt.selected).length;
    const canConfirm = isPending && (data.selection_mode === 'single' ? selectedCount === 1 : selectedCount > 0);

    const getStatusConfig = (status: SelectionStatus) => {
        switch (status) {
            case 'pending': return { label: 'Waiting for your choice', icon: Clock, color: 'text-amber-600', badgeInfo: 'bg-amber-100 text-amber-800' };
            case 'selected': return { label: 'Selection confirmed', icon: CheckCircle2, color: 'text-primary', badgeInfo: 'bg-primary/10 text-primary' };
            case 'expired': return { label: 'Selection expired', icon: AlertCircle, color: 'text-muted-foreground', badgeInfo: 'bg-muted text-muted-foreground' };
            case 'cancelled': return { label: 'Selection cancelled', icon: XCircle, color: 'text-destructive', badgeInfo: 'bg-destructive/10 text-destructive' };
        }
    };

    const statusConfig = getStatusConfig(data.status);
    const StatusIcon = statusConfig.icon;

    return (
        <Card className="w-[400px] shadow-md border-amber-200 bg-amber-50/30">
            <Handle type="target" position={Position.Top} isConnectable={false} className="opacity-0" />

            <CardHeader className="p-4 pb-3 border-b border-amber-100 flex flex-row items-center justify-between">
                <div className="flex items-center gap-2">
                    <StatusIcon className={`w-5 h-5 ${statusConfig.color}`} />
                    <CardTitle className="text-base font-semibold">{data.title}</CardTitle>
                </div>
                <Badge variant="secondary" className={statusConfig.badgeInfo}>
                    {statusConfig.label}
                </Badge>
            </CardHeader>

            <CardContent className="p-4 flex flex-col gap-3">
                <p className="text-sm text-foreground/80 font-medium">
                    {data.instruction}
                </p>

                {data.status === 'pending' && (
                    <div className="flex items-center justify-between mt-2">
                        <div className="text-xs text-muted-foreground font-medium">
                            {data.selection_mode === 'multiple'
                                ? `${selectedCount} selected`
                                : (selectedCount === 1 ? '1 selected' : 'Please select one')}
                        </div>
                        <div className="flex gap-2">
                            {data.selection_mode === 'multiple' && (
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-7 text-xs"
                                    onClick={() => clearSelection(data.selection_group_id)}
                                    disabled={selectedCount === 0}
                                >
                                    Clear
                                </Button>
                            )}
                            <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 text-xs text-destructive hover:text-destructive"
                                onClick={() => cancelGroup(data.selection_group_id)}
                            >
                                Cancel
                            </Button>
                            <Button
                                variant="default"
                                size="sm"
                                className="h-7 text-xs"
                                onClick={() => confirmSelection(data.selection_group_id)}
                                disabled={!canConfirm}
                            >
                                Confirm
                            </Button>
                        </div>
                    </div>
                )}
            </CardContent>

            <Handle type="source" position={Position.Bottom} isConnectable={false} className="opacity-0" />
        </Card>
    );
}
