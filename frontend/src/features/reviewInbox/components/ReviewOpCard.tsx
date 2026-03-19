import { formatDateTime } from '@/lib/string';
import type { ReviewOpItem } from '@/services/organize/port';

function stateClassName(state: ReviewOpItem['state']) {
    switch (state) {
        case 'approved':
            return 'border-sky-200 bg-sky-50 text-sky-700';
        case 'applied':
            return 'border-emerald-200 bg-emerald-50 text-emerald-700';
        case 'dismissed':
            return 'border-slate-200 bg-slate-100 text-slate-600';
        case 'planned':
        default:
            return 'border-amber-200 bg-amber-50 text-amber-700';
    }
}

export function ReviewOpCard({ item }: { item: ReviewOpItem }) {
    return (
        <article className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-[0_18px_38px_-30px_rgba(15,23,42,0.3)]">
            <div className="flex items-start justify-between gap-3">
                <div>
                    <div className="text-sm font-semibold text-slate-900">{item.title}</div>
                    <div className="mt-1 text-xs text-slate-500">{formatDateTime(item.createdAt)} • {item.opType}</div>
                </div>
                <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${stateClassName(item.state)}`}>
                    {item.state}
                </span>
            </div>

            <div className="mt-4 space-y-2 text-xs text-slate-700">
                <div>Reason: {item.reason ?? 'Reason is not surfaced by the current organizeOps document.'}</div>
                <div>Trace: {item.traceId ?? 'Not surfaced yet'}</div>
                <div>Source event: {item.sourceEventType ?? 'Not surfaced yet'}</div>
                <div>Targets: {item.nodeIds.length > 0 ? item.nodeIds.join(', ') : 'Not surfaced yet'}</div>
                <div>Generation: {item.generation ?? 'Not surfaced yet'}</div>
                <div>Requires review: {item.requiresHumanReview === undefined ? 'Not surfaced yet' : (item.requiresHumanReview ? 'Yes' : 'No')}</div>
            </div>
        </article>
    );
}