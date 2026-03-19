import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Lightbulb } from 'lucide-react';
import { RichTextPane } from '@/features/nodeMarkdown/components/RichTextPane';

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
                    <RichTextPane
                        content={contextSummary}
                        markdownClassName="prose prose-sm max-w-none text-foreground/90 prose-p:my-2 prose-headings:mt-3 prose-headings:mb-2 prose-a:text-primary"
                    />
                )}
                {detailHtml && (
                    <RichTextPane
                        content={detailHtml}
                        markdownClassName="prose prose-sm max-w-none text-muted-foreground prose-p:my-2 prose-headings:mt-3 prose-headings:mb-2 prose-a:text-primary"
                        htmlClassName="text-sm text-muted-foreground prose prose-sm dark:prose-invert prose-p:leading-relaxed prose-li:my-0 mt-1"
                    />
                )}
            </CardContent>
        </Card>
    );
}
