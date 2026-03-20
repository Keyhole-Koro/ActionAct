import { HelpCircle, Keyboard } from 'lucide-react';
import { Panel, useReactFlow, useViewport } from '@xyflow/react';

type NavControlProps = {
    actNodeIds: string[];
    activeNodeId: string | null;
    onFocusActNode: (nodeId: string) => void;
};

const ZOOM_LEVELS = [0.4, 0.65, 1.0, 1.5] as const;

export function NavControl({ actNodeIds, activeNodeId, onFocusActNode }: NavControlProps) {
    const { zoomTo, fitView } = useReactFlow();
    const { zoom } = useViewport();

    const zoomIdx = ZOOM_LEVELS.reduce((best, level, idx) =>
        Math.abs(level - zoom) < Math.abs(ZOOM_LEVELS[best] - zoom) ? idx : best, 0);

    const zoomStep = (delta: 1 | -1) => {
        const next = Math.min(Math.max(zoomIdx + delta, 0), ZOOM_LEVELS.length - 1);
        zoomTo(ZOOM_LEVELS[next], { duration: 220 });
    };

    const actIdx = actNodeIds.indexOf(activeNodeId ?? '');
    const hasAct = actNodeIds.length > 0;

    const focusAct = (delta: 1 | -1) => {
        if (!hasAct) return;
        const base = actIdx < 0 ? (delta === 1 ? -1 : actNodeIds.length) : actIdx;
        const next = (base + delta + actNodeIds.length) % actNodeIds.length;
        onFocusActNode(actNodeIds[next]);
    };

    const iconBtn = 'flex h-7 w-7 items-center justify-center rounded-md transition-colors';
    const activeBtn = `${iconBtn} text-slate-600 hover:bg-slate-100`;
    const disabledBtn = `${iconBtn} text-slate-300 cursor-default`;

    return (
        <Panel position="bottom-left" className="!m-3">
            <div className="flex flex-col items-center gap-0.5 rounded-lg border border-border/40 bg-white shadow-sm p-1 select-none">
                <button type="button" onClick={() => zoomStep(1)} disabled={zoomIdx >= ZOOM_LEVELS.length - 1}
                    className={zoomIdx >= ZOOM_LEVELS.length - 1 ? disabledBtn : activeBtn} title="Zoom in">
                    <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                        <line x1="6" y1="1" x2="6" y2="11"/><line x1="1" y1="6" x2="11" y2="6"/>
                    </svg>
                </button>

                <div className="flex flex-col items-center gap-0.5 py-0.5">
                    {ZOOM_LEVELS.map((level, idx) => (
                        <button key={level} type="button" onClick={() => zoomTo(level, { duration: 220 })}
                            className={`h-1.5 w-1.5 rounded-full transition-all ${idx === zoomIdx ? 'bg-primary scale-125' : 'bg-slate-300 hover:bg-slate-400'}`}
                            title={`${Math.round(level * 100)}%`} />
                    ))}
                </div>

                <button type="button" onClick={() => zoomStep(-1)} disabled={zoomIdx <= 0}
                    className={zoomIdx <= 0 ? disabledBtn : activeBtn} title="Zoom out">
                    <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                        <line x1="1" y1="6" x2="11" y2="6"/>
                    </svg>
                </button>

                <div className="my-0.5 w-6 border-t border-border/40" />

                <div className="flex items-center gap-0.5">
                    <button type="button" onClick={() => focusAct(-1)} disabled={!hasAct}
                        className={!hasAct ? disabledBtn : activeBtn} title="Previous act node">
                        <svg width="9" height="9" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="7,1 3,5 7,9"/>
                        </svg>
                    </button>
                    <span className="w-6 text-center text-[10px] font-medium text-slate-400 tabular-nums">
                        {hasAct ? `${actIdx >= 0 ? actIdx + 1 : '-'} / ${actNodeIds.length}` : '-'}
                    </span>
                    <button type="button" onClick={() => focusAct(1)} disabled={!hasAct}
                        className={!hasAct ? disabledBtn : activeBtn} title="Next act node">
                        <svg width="9" height="9" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="3,1 7,5 3,9"/>
                        </svg>
                    </button>
                </div>

                <div className="my-0.5 w-6 border-t border-border/40" />

                <button type="button" onClick={() => fitView({ duration: 300, padding: 0.12 })}
                    className={activeBtn} title="Fit view">
                    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8">
                        <path d="M1 5V2h3M15 5V2h-3M1 11v3h3M15 11v3h-3" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                </button>
            </div>
        </Panel>
    );
}

const SHORTCUTS = [
    { keys: ['Up', 'Down'], desc: 'Zoom in / out' },
    { keys: ['Left', 'Right'], desc: 'Act node switch' },
    { keys: ['Cmd', 'F'], desc: 'Node search (partial)' },
    { keys: ['Type'], desc: 'With node selected -> create Act' },
    { keys: ['Click'], desc: 'Expand node / focus' },
    { keys: ['Cmd', 'Click'], desc: 'Multi select' },
    { keys: ['Double click'], desc: 'Zoom in' },
    { keys: ['Space', 'Drag'], desc: 'Pan' },
] as const;

export function KeyboardShortcutsHint() {
    return (
        <div className="fixed right-0 top-1/3 z-[100] group">
            <div className="absolute right-full top-0 mr-2 w-64 origin-right scale-95 rounded-2xl border border-slate-200 bg-white/98 backdrop-blur-xl shadow-[0_20px_50px_rgba(0,0,0,0.15)] opacity-0 pointer-events-none transition-all duration-300 ease-out group-hover:opacity-100 group-hover:scale-100 group-hover:pointer-events-auto group-hover:-translate-x-2">
                <div className="px-4 pt-4 pb-2 border-b border-slate-100">
                    <div className="flex items-center gap-2">
                        <Keyboard className="h-4 w-4 text-primary" />
                        <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-slate-500">
                            Shortcuts and Help
                        </p>
                    </div>
                </div>
                <ul className="px-4 py-3 flex flex-col gap-2.5">
                    {SHORTCUTS.map(({ keys, desc }, i) => (
                        <li key={i} className="flex items-center justify-between gap-4">
                            <span className="text-[11px] font-semibold text-slate-500">{desc}</span>
                            <span className="flex items-center gap-1 shrink-0">
                                {keys.map((k) => (
                                    <kbd key={k} className="inline-flex items-center justify-center rounded-md border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-bold text-slate-700 shadow-sm leading-none whitespace-nowrap">{k}</kbd>
                                ))}
                            </span>
                        </li>
                    ))}
                </ul>
                <div className="px-4 py-2 bg-slate-50/50 rounded-b-2xl border-t border-slate-100">
                    <p className="text-[10px] text-slate-400 font-medium">Tip: Press <span className="font-bold text-slate-600">/</span> to search anywhere</p>
                </div>
            </div>

            <div className="flex flex-col items-center gap-2 rounded-l-2xl border border-r-0 border-slate-200 bg-white py-4 px-2 shadow-[-4px_0_15px_rgba(0,0,0,0.05)] text-slate-400 hover:text-primary transition-all cursor-help select-none group-hover:bg-slate-50/80">
                <HelpCircle className="h-5 w-5" />
                <span className="[writing-mode:vertical-lr] text-[10px] font-bold uppercase tracking-widest text-slate-400 group-hover:text-primary">Shortcuts</span>
            </div>
        </div>
    );
}
