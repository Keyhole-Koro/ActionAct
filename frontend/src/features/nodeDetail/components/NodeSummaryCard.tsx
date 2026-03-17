import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Lightbulb, Code } from 'lucide-react';
import { RichTextPane } from '@/features/nodeMarkdown/components/RichTextPane';
import { HtmlPreview } from '@/components/ui/HtmlPreview';

interface NodeSummaryCardProps {
    contextSummary?: string;
    detailHtml?: string;
}

export function NodeSummaryCard({ contextSummary, detailHtml }: NodeSummaryCardProps) {
    if (!contextSummary && !detailHtml) return null;

    return (
        <Card className="mb-6 bg-muted/30 border-primary/20 shadow-sm overflow-hidden">
            <CardHeader className="p-4 pb-2 flex flex-row items-center justify-between space-y-0">
                <CardTitle className="flex items-center gap-2 text-sm font-semibold text-primary">
                    <Lightbulb className="w-4 h-4" />
                    AI Summary
                </CardTitle>
                {detailHtml && (
                    <div className="flex items-center gap-1.5 text-[10px] font-medium text-muted-foreground uppercase tracking-wider bg-slate-100 px-2 py-0.5 rounded-full border border-slate-200">
                        <Code className="w-3 h-3" />
                        Embedded HTML
                    </div>
                )}
            </CardHeader>
            <CardContent className="p-4 pt-0 flex flex-col gap-4">
                {contextSummary && (
                    <RichTextPane
                        content={contextSummary}
                        markdownClassName="prose prose-sm max-w-none text-foreground/90 prose-p:my-2 prose-headings:mt-3 prose-headings:mb-2 prose-a:text-primary"
                    />
                )}
                {detailHtml && (
                    <div className="mt-1 rounded-lg border border-slate-200/60 bg-white p-4 shadow-inner min-h-[100px] overflow-auto">
                        <HtmlPreview html={detailHtml} />
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
