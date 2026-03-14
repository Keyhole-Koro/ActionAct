"use client";

import React from 'react';
import { Handle, Position, NodeProps, Node } from '@xyflow/react';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Play } from 'lucide-react';
import { useActStream } from '@/features/action/actionAct/hooks/useActStream';
import { useKnowledgeTreeStore } from '@/features/knowledgeTree/store';

type CustomNode = Node<{
    label: string;
    type: string;
    actions?: { label: string, execute: string }[];
    contentMd?: string;
}, 'customTask'>;

export function GraphNodeCard({ id, data, selected, isConnectable }: NodeProps<CustomNode>) {
    const { startStream, isStreaming } = useActStream();
    const { setSelectedNodes } = useKnowledgeTreeStore();
    return (
        <>
            <Handle type="target" position={Position.Top} isConnectable={isConnectable} className="w-2 h-2" />
            <Card className={`w-[200px] shadow-md border-muted transition-colors ${selected ? 'border-primary ring-2 ring-primary ring-offset-2' : ''}`}>
                <CardHeader className="p-3 pb-2 border-b bg-muted/30 flex flex-row items-center justify-between">
                    <CardTitle className="text-sm font-medium">{data.label}</CardTitle>
                    <Badge variant="outline" className="text-[10px] px-1 py-0">{data.type}</Badge>
                </CardHeader>
                <CardContent className="p-3 text-xs text-muted-foreground">
                    <p className="line-clamp-2">{data.contentMd || 'Graph node placeholder content...'}</p>
                </CardContent>
                {data.actions && data.actions.length > 0 && (
                    <CardFooter className="p-3 pt-0 flex flex-wrap gap-2">
                        {data.actions.map((action: { label: string, execute: string }, idx: number) => (
                            <Button
                                key={idx}
                                variant="secondary"
                                size="sm"
                                className="h-6 text-[10px] px-2"
                                disabled={isStreaming}
                                onClick={(e: React.MouseEvent) => {
                                    e.stopPropagation();
                                    setSelectedNodes([id]);
                                    startStream(action.label, { clear: false }); // Trigger stream based on action, append to graph
                                }}
                            >
                                <Play className="w-3 h-3 mr-1" />
                                {action.label}
                            </Button>
                        ))}
                    </CardFooter>
                )}
            </Card>
            <Handle type="source" position={Position.Bottom} isConnectable={isConnectable} className="w-2 h-2" />
        </>
    );
}
