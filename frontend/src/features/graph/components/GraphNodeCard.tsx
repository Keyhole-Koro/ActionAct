"use client";

import React from 'react';
import { Handle, Position, NodeProps, Node } from '@xyflow/react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

type CustomNode = Node<{
    label: string;
    type: string;
}, 'customTask'>;

export function GraphNodeCard({ data, selected, isConnectable }: NodeProps<CustomNode>) {
    return (
        <>
            <Handle type="target" position={Position.Top} isConnectable={isConnectable} className="w-2 h-2" />
            <Card className={`w-[200px] shadow-md border-muted transition-colors ${selected ? 'border-primary ring-2 ring-primary ring-offset-2' : ''}`}>
                <CardHeader className="p-3 pb-2 border-b bg-muted/30 flex flex-row items-center justify-between">
                    <CardTitle className="text-sm font-medium">{data.label}</CardTitle>
                    <Badge variant="outline" className="text-[10px] px-1 py-0">{data.type}</Badge>
                </CardHeader>
                <CardContent className="p-3 text-xs text-muted-foreground">
                    Abstract conceptual node block representing parsed topic idea.
                </CardContent>
            </Card>
            <Handle type="source" position={Position.Bottom} isConnectable={isConnectable} className="w-2 h-2" />
        </>
    );
}
