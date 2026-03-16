import type { TopicActivityItem } from '@/services/organize/port';

export function RoutingDecisionBadge({ item }: { item: TopicActivityItem }) {
    const resolutionMode = item.resolutionMode ?? 'unresolved';
    const tone = resolutionMode === 'attach_existing'
        ? 'border-sky-200 bg-sky-50 text-sky-700'
        : resolutionMode === 'create_new'
            ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
            : 'border-slate-200 bg-slate-100 text-slate-600';

    return (
        <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${tone}`}>
            {resolutionMode.replace(/_/g, ' ')}
        </span>
    );
}