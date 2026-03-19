import { AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';

import { RoutingDecisionBadge } from './RoutingDecisionBadge';
import { formatDateTime } from '@/lib/string';
import type { TopicActivityItem } from '@/services/organize/port';

function StatusIcon({ status }: { status: TopicActivityItem['status'] }) {
    if (status === 'completed') {
        return <CheckCircle2 className="h-4 w-4 text-emerald-600" />;
    }
    if (status === 'failed') {
        return <AlertCircle className="h-4 w-4 text-rose-600" />;
    }
    return <Loader2 className="h-4 w-4 animate-spin text-amber-600" />;
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <div className="rounded-2xl border border-slate-200/80 bg-white/80 p-3">
            <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">{title}</div>
            <div className="mt-2 space-y-1.5 text-xs leading-5 text-slate-700">{children}</div>
        </div>
    );
}

export function TopicTimelineItem({ item }: { item: TopicActivityItem & { title?: string } }) {
    return (
        <article className="rounded-[24px] border border-slate-200 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.92))] p-4 shadow-[0_18px_38px_-28px_rgba(15,23,42,0.3)]">
            <div className="flex items-start justify-between gap-3">
                <div>
                    <div className="flex items-center gap-2">
                        <StatusIcon status={item.status} />
                        <h3 className="text-sm font-semibold text-slate-900">{item.title ?? item.inputId}</h3>
                    </div>
                    <div className="mt-1 text-xs text-slate-500">{formatDateTime(item.updatedAt ?? item.createdAt)} • {item.status.replace(/_/g, ' ')}</div>
                </div>
                <RoutingDecisionBadge item={item} />
            </div>

            <div className="mt-4 grid gap-3">
                <Block title="Routing">
                    <div>Mode: {item.resolutionMode ?? 'Not surfaced yet'}</div>
                    <div>Reason: {item.currentPhase ?? item.lastEventType ?? 'Not surfaced yet'}</div>
                    <div>Resolved topic: {item.resolvedTopicId ?? 'Not surfaced yet'}</div>
                </Block>
                <Block title="Draft">
                    <div>Draft version: {item.draftVersion ?? 'Not surfaced yet'}</div>
                    <div>{item.draftSummary ?? 'Draft diff summary is not surfaced by the current snapshot.'}</div>
                </Block>
                <Block title="Bundle">
                    <div>Bundle: {item.bundleId ?? 'Not surfaced yet'}</div>
                    <div>{item.bundleSummary ?? 'Bundle summary is not surfaced by the current snapshot.'}</div>
                    <div>Schema change: {item.hasSchemaChange === undefined ? 'Not surfaced yet' : (item.hasSchemaChange ? 'Yes' : 'No')}</div>
                </Block>
                <Block title="Outline">
                    <div>Outline version: {item.outlineVersion ?? 'Not surfaced yet'}</div>
                    <div>{item.outlineSummary ?? 'Outline update summary is not surfaced by the current snapshot.'}</div>
                    <div>Changed nodes: {item.changedNodeCount ?? 'Not surfaced yet'}</div>
                </Block>
            </div>

            {item.status === 'failed' && (
                <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">
                    <div className="flex items-start gap-2">
                        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                        <div className="space-y-1">
                            {item.errorCode && (
                                <div className="font-bold uppercase tracking-tight text-[10px] opacity-80">
                                    Error Code: {item.errorCode}
                                </div>
                            )}
                            <div className="leading-relaxed">
                                {item.errorMessage ?? 'This input failed, but the backend did not surface a detailed reason.'}
                            </div>
                            {item.traceId && (
                                <div className="mt-2 font-mono text-[9px] opacity-60">
                                    Trace ID: {item.traceId}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </article>
    );
}