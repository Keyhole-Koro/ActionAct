import React from 'react';
import { FileImage, FileText, FileSearch } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useGraphStore } from '@/features/graph/store';

type NodeInputMediaCardProps = {
    workspaceId: string;
    inputId: string;
};

export function NodeInputMediaCard({
    workspaceId,
    inputId,
}: NodeInputMediaCardProps) {
    const setFilePreview = useGraphStore((state) => state.setFilePreview);

    return (
        <Card className="mt-8 border-sky-200/70 bg-sky-50/70 shadow-sm">
            <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm font-semibold text-sky-900">
                    <FileImage className="h-4 w-4" />
                    Source Media
                </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
                <div className="rounded-lg border border-sky-100 bg-white/90 px-3 py-2">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-sky-700/80">
                        Input ID
                    </div>
                    <div className="mt-1 break-all font-mono text-xs text-slate-700">
                        {inputId}
                    </div>
                </div>
                <div className="flex flex-wrap gap-2">
                    <Button
                        type="button"
                        size="sm"
                        className="gap-2"
                        onClick={() => setFilePreview(workspaceId, inputId)}
                    >
                        <FileSearch className="h-4 w-4" />
                        Preview media
                    </Button>
                    <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="gap-2"
                        onClick={() => setFilePreview(workspaceId, inputId)}
                    >
                        <FileText className="h-4 w-4" />
                        Open in panel
                    </Button>
                </div>
            </CardContent>
        </Card>
    );
}
