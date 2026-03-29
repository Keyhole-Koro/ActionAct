"use client";

import { LayoutGrid, List } from "lucide-react";
import { cn } from "@/lib/utils";

export type Layout = "grid" | "list";

interface LayoutToggleProps {
    value: Layout;
    onChange: (v: Layout) => void;
}

/** グリッド ↔ リスト の表示切り替えボタン */
export function LayoutToggle({ value, onChange }: LayoutToggleProps) {
    return (
        <div className="flex items-center rounded-lg border bg-slate-50 p-0.5">
            <button
                onClick={() => onChange("grid")}
                className={cn(
                    "p-1.5 rounded-md transition-colors",
                    value === "grid"
                        ? "bg-white shadow-sm text-slate-700"
                        : "text-slate-400 hover:text-slate-600",
                )}
            >
                <LayoutGrid className="h-3.5 w-3.5" />
            </button>
            <button
                onClick={() => onChange("list")}
                className={cn(
                    "p-1.5 rounded-md transition-colors",
                    value === "list"
                        ? "bg-white shadow-sm text-slate-700"
                        : "text-slate-400 hover:text-slate-600",
                )}
            >
                <List className="h-3.5 w-3.5" />
            </button>
        </div>
    );
}
