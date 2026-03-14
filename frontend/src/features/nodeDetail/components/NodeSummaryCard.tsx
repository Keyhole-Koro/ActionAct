import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Lightbulb } from 'lucide-react';

interface NodeSummaryCardProps {
    contextSummary?: string;
    detailHtml?: string;
}

export function NodeSummaryCard({ contextSummary, detailHtml }: NodeSummaryCardProps) {
    if (!contextSummary && !detailHtml) return null;

    return (
        <Card className="mb-6 bg-muted/30 border-primary/20 shadow-sm">
            <CardHeader className="p-4 pb-2">
                <CardTitle className="flex items-center gap-2 text-sm font-semibold text-primary">
                    <Lightbulb className="w-4 h-4" />
                    AI Summary
                </CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0 flex flex-col gap-3">
                {contextSummary && (
                    <p className="text-sm text-foreground/90 font-medium leading-relaxed">
                        {contextSummary}
                    </p>
                )}
                {detailHtml && (
                    <div
                        className="text-sm text-muted-foreground prose prose-sm dark:prose-invert prose-p:leading-relaxed prose-li:my-0 mt-1"
                        dangerouslySetInnerHTML={{ __html: detailHtml }}
                    />
                )}
            </CardContent>
        </Card>
    );
}
