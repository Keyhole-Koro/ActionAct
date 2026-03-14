import React from 'react';
import { EvidenceRef } from '@/services/organize/port';
import { BookOpen, ExternalLink } from 'lucide-react';
import { Card } from '@/components/ui/card';

interface NodeEvidenceListProps {
    evidenceRefs?: EvidenceRef[];
}

export function NodeEvidenceList({ evidenceRefs }: NodeEvidenceListProps) {
    if (!evidenceRefs || evidenceRefs.length === 0) return null;

    return (
        <div className="mt-8 pt-6 border-t border-border/50">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground mb-4">
                <BookOpen className="w-4 h-4 text-muted-foreground" />
                References & Evidence
            </h3>

            <div className="flex flex-col gap-3">
                {evidenceRefs.map(ref => (
                    <Card key={ref.id} className="p-3 bg-card shadow-sm border-muted transition-colors hover:border-border">
                        <div className="flex items-start justify-between gap-4">
                            <div className="flex-1">
                                <h4 className="text-sm font-medium leading-none mb-2">
                                    {ref.url ? (
                                        <a href={ref.url} target="_blank" rel="noopener noreferrer" className="hover:underline text-primary flex items-center gap-1">
                                            {ref.title}
                                            <ExternalLink className="w-3 h-3" />
                                        </a>
                                    ) : (
                                        ref.title
                                    )}
                                </h4>
                                {ref.snippet && (
                                    <p className="text-xs text-muted-foreground italic border-l-2 border-muted-foreground/30 pl-2">
                                        "{ref.snippet}"
                                    </p>
                                )}
                            </div>
                        </div>
                    </Card>
                ))}
            </div>
        </div>
    );
}
