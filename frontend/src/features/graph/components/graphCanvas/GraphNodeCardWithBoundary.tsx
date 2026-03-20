import React from 'react';
import { GraphNodeCard } from '../GraphNodeCard';

class GraphNodeRenderBoundary extends React.Component<
    { children: React.ReactNode; nodeId?: string; label?: string },
    { hasError: boolean; errorMessage: string | null }
> {
    constructor(props: { children: React.ReactNode; nodeId?: string; label?: string }) {
        super(props);
        this.state = { hasError: false, errorMessage: null };
    }

    static getDerivedStateFromError(error: Error) {
        return {
            hasError: true,
            errorMessage: error instanceof Error ? error.message : String(error),
        };
    }

    componentDidCatch(error: Error) {
        console.error('[GraphNodeCard DEBUG] render error', {
            nodeId: this.props.nodeId,
            label: this.props.label,
            error,
        });
    }

    render() {
        if (this.state.hasError) {
            return (
                <div className="w-[340px] rounded-xl border border-destructive/50 bg-destructive/10 p-3 text-xs text-destructive shadow-sm">
                    <div className="font-semibold">GraphNodeCard render failed</div>
                    <div className="mt-1 break-all">nodeId: {this.props.nodeId ?? 'unknown'}</div>
                    <div className="mt-1 break-all">label: {this.props.label ?? ''}</div>
                    <div className="mt-1 break-all">{this.state.errorMessage}</div>
                </div>
            );
        }
        return this.props.children;
    }
}

export function GraphNodeCardWithBoundary(props: React.ComponentProps<typeof GraphNodeCard>) {
    const label = typeof props.data?.label === 'string' ? props.data.label : '';
    return (
        <GraphNodeRenderBoundary nodeId={props.id} label={label}>
            <GraphNodeCard {...props} />
        </GraphNodeRenderBoundary>
    );
}
