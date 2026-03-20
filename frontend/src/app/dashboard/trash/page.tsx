"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
    Search, Trash2, Layout, RotateCcw, CheckSquare, Square,
    ArrowLeft, Calendar, Clock, ArrowUpDown, LayoutGrid, List,
} from "lucide-react";

import { useRequireAuth } from "@/features/auth/hooks/useRequireAuth";
import { UserAvatar } from "@/features/layout/components/UserAvatar";
import { workspaceService, type WorkspaceData } from "@/features/workspace/services/workspace-service";
import { Sidebar } from "@/features/dashboard/components/Sidebar";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useWorkspaceSelection } from "@/features/dashboard/hooks/useWorkspaceSelection";
import { useLanguage } from "@/features/dashboard/hooks/useLanguage";

type TrashSortKey = "deletedAt" | "createdAt";
type SortDir = "desc" | "asc";
type LayoutType = "grid" | "list";

const dict = {
    ja: {
        title: "Trash",
        searchPlaceholder: "ゴミ箱内を検索...",
        empty: "ゴミ箱は空です",
        selectAll: "すべて選択",
        selectedCount: (n: number) => `${n} 件選択中`,
        restore: "復元",
        restoring: "復元中...",
        deleteForever: "完全に削除",
        deleting: "削除中...",
        cancel: "キャンセル",
        select: "選択",
        deletedAt: "削除日",
        createdAt: "作成日",
        newest: "新しい順",
        oldest: "古い順",
        createdLabel: "作成:",
        deletedLabel: "削除:",
        confirmRestore: "復元しますか？",
        confirmDelete: "完全に削除しますか？",
        confirmBulkRestore: (n: number) => `${n} 件を復元しますか？`,
        confirmBulkDelete: (n: number) => `【警告】選択した ${n} 件を完全に消去します。\nこの操作は取り消せません。`,
    },
    en: {
        title: "Trash",
        searchPlaceholder: "Search trash...",
        empty: "Trash is empty",
        selectAll: "Select All",
        selectedCount: (n: number) => `${n} selected`,
        restore: "Restore",
        restoring: "Restoring...",
        deleteForever: "Delete forever",
        deleting: "Deleting...",
        cancel: "Cancel",
        select: "Select",
        deletedAt: "Deleted",
        createdAt: "Created",
        newest: "Newest",
        oldest: "Oldest",
        createdLabel: "Created:",
        deletedLabel: "Deleted:",
        confirmRestore: "Restore this workspace?",
        confirmDelete: "Delete permanently?",
        confirmBulkRestore: (n: number) => `Restore ${n} workspaces?`,
        confirmBulkDelete: (n: number) => `[WARNING] Permanently delete ${n} items?\nThis cannot be undone.`,
    },
} as const;

function tsToMs(ts: any): number {
    if (!ts) return 0;
    if (typeof ts.toDate === "function") return ts.toDate().getTime();
    return new Date(ts).getTime();
}

function formatDate(ts: any): string | null {
    if (!ts) return null;
    try {
        const date: Date = typeof ts.toDate === "function" ? ts.toDate() : new Date(ts);
        return date.toLocaleDateString("ja-JP", { year: "numeric", month: "short", day: "numeric" });
    } catch {
        return null;
    }
}

function LayoutToggle({ value, onChange }: { value: LayoutType; onChange: (v: LayoutType) => void }) {
    return (
        <div className="flex items-center rounded-lg border bg-slate-50 p-0.5">
            <button
                onClick={() => onChange("grid")}
                className={cn("p-1.5 rounded-md transition-colors", value === "grid" ? "bg-white shadow-sm text-slate-700" : "text-slate-400 hover:text-slate-600")}
            >
                <LayoutGrid className="h-3.5 w-3.5" />
            </button>
            <button
                onClick={() => onChange("list")}
                className={cn("p-1.5 rounded-md transition-colors", value === "list" ? "bg-white shadow-sm text-slate-700" : "text-slate-400 hover:text-slate-600")}
            >
                <List className="h-3.5 w-3.5" />
            </button>
        </div>
    );
}

export default function TrashPage() {
    const { user, loading } = useRequireAuth();
    const router = useRouter();
    const lang = useLanguage();
    const tx = dict[lang];

    const [trashItems, setTrashItems] = useState<WorkspaceData[]>([]);
    const [searchTerm, setSearchTerm] = useState("");
    const [isProcessing, setIsProcessing] = useState(false);
    const [sortKey, setSortKey] = useState<TrashSortKey>("deletedAt");
    const [sortDir, setSortDir] = useState<SortDir>("desc");
    const [layout, setLayout] = useState<LayoutType>("list");

    const { isSelectionMode, setIsSelectionMode, selectedIds, toggleSelect, selectAll, clearSelection } = useWorkspaceSelection();

    const fetchTrash = useCallback(async () => {
        if (!user) return;
        try {
            const data = await workspaceService.listTrashWorkspaces(user.uid);
            setTrashItems(data);
        } catch (e) {
            console.error("Trash fetch error:", e);
        }
    }, [user]);

    useEffect(() => {
        if (user) fetchTrash();
    }, [user, fetchTrash]);

    const filteredItems = useMemo(() => {
        const filtered = searchTerm
            ? trashItems.filter(ws => (ws.name || "").toLowerCase().includes(searchTerm.toLowerCase()))
            : trashItems;
        return [...filtered].sort((a, b) => {
            const diff = tsToMs(a[sortKey]) - tsToMs(b[sortKey]);
            return sortDir === "desc" ? -diff : diff;
        });
    }, [trashItems, searchTerm, sortKey, sortDir]);

    const handleBulkRestore = async () => {
        if (selectedIds.size === 0 || isProcessing) return;
        if (!confirm(tx.confirmBulkRestore(selectedIds.size))) return;
        setIsProcessing(true);
        try {
            await Promise.all(Array.from(selectedIds).map(id => workspaceService.restoreWorkspace(id)));
            clearSelection();
            await fetchTrash();
        } catch (error) {
            console.error("Bulk restore error:", error);
        } finally {
            setIsProcessing(false);
        }
    };

    const handleBulkPermanentDelete = async () => {
        if (selectedIds.size === 0 || isProcessing) return;
        if (!confirm(tx.confirmBulkDelete(selectedIds.size))) return;
        setIsProcessing(true);
        try {
            const ids = Array.from(selectedIds);
            setTrashItems(prev => prev.filter(item => !selectedIds.has(item.id)));
            await Promise.all(ids.map(id => workspaceService.permanentDeleteWorkspace(id)));
            clearSelection();
            await fetchTrash();
        } catch (error) {
            console.error("Bulk delete error:", error);
            await fetchTrash();
        } finally {
            setIsProcessing(false);
        }
    };

    if (loading) return null;

    return (
        <div className="flex h-screen w-full bg-slate-50 overflow-hidden text-slate-900">
            <Sidebar />

            <main className="flex-1 flex flex-col bg-white overflow-hidden">
                <header className="h-16 border-b flex items-center justify-between px-8 shrink-0">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                        <Button variant="ghost" size="icon" onClick={() => router.push("/dashboard")} className="text-slate-400 shrink-0">
                            <ArrowLeft className="h-5 w-5" />
                        </Button>
                        <div className="relative w-full max-w-xs">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                            <input
                                type="text"
                                placeholder={tx.searchPlaceholder}
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="w-full pl-10 pr-4 py-1.5 bg-slate-100 rounded-lg text-sm outline-none focus:ring-2 ring-blue-500/20"
                            />
                        </div>
                        <div className="flex items-center gap-1 rounded-lg border bg-slate-50 p-1 text-xs shrink-0">
                            <ArrowUpDown className="ml-1 h-3.5 w-3.5 text-slate-400" />
                            <select value={sortKey} onChange={(e) => setSortKey(e.target.value as TrashSortKey)}
                                className="bg-transparent text-slate-600 outline-none cursor-pointer pr-1">
                                <option value="deletedAt">{tx.deletedAt}</option>
                                <option value="createdAt">{tx.createdAt}</option>
                            </select>
                            <select value={sortDir} onChange={(e) => setSortDir(e.target.value as SortDir)}
                                className="bg-transparent text-slate-600 outline-none cursor-pointer pr-1">
                                <option value="desc">{tx.newest}</option>
                                <option value="asc">{tx.oldest}</option>
                            </select>
                        </div>
                        <LayoutToggle value={layout} onChange={setLayout} />
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                        {isSelectionMode ? (
                            <div className="flex items-center gap-3 animate-in slide-in-from-right-4 duration-200">
                                <Button variant="ghost" size="sm" disabled={isProcessing}
                                    onClick={() => selectAll(filteredItems.map(ws => ws.id))}
                                    className="text-[11px] font-bold text-blue-600 px-2 hover:bg-blue-50">
                                    {tx.selectAll}
                                </Button>
                                <span className="text-xs font-bold text-slate-400 whitespace-nowrap px-2 border-l pl-3">
                                    {tx.selectedCount(selectedIds.size)}
                                </span>
                                <Button onClick={handleBulkRestore} disabled={selectedIds.size === 0 || isProcessing}
                                    className="bg-blue-50 text-blue-600 hover:bg-blue-100 border-none h-9 px-4 rounded-lg flex items-center shrink-0">
                                    <RotateCcw className="h-4 w-4 mr-2" /> {isProcessing ? tx.restoring : tx.restore}
                                </Button>
                                <Button onClick={handleBulkPermanentDelete} disabled={selectedIds.size === 0 || isProcessing}
                                    className="bg-red-50 text-red-600 hover:bg-red-100 border-none h-9 px-4 rounded-lg flex items-center shrink-0 font-bold">
                                    {isProcessing ? tx.deleting : tx.deleteForever}
                                </Button>
                                <Button onClick={clearSelection} variant="ghost" disabled={isProcessing} className="h-9 px-4 text-slate-500 shrink-0">
                                    {tx.cancel}
                                </Button>
                            </div>
                        ) : (
                            <Button onClick={() => setIsSelectionMode(true)} variant="ghost" className="h-9 px-4 text-slate-500 hover:text-blue-600 flex items-center shrink-0">
                                <CheckSquare className="h-4 w-4 mr-2" /> {tx.select}
                            </Button>
                        )}
                        <div className="h-4 w-px bg-slate-200 mx-1 shrink-0" />
                        <UserAvatar className="h-8 w-8 rounded-full border shadow-sm shrink-0" />
                    </div>
                </header>

                <div className="flex-1 overflow-y-auto p-8">
                    <div className="mx-auto max-w-5xl">
                        <div className="mb-8">
                            <h1 className="text-xl font-bold flex items-center gap-2">
                                <Trash2 className="h-5 w-5 text-red-500" /> {tx.title}
                            </h1>
                        </div>

                        {filteredItems.length > 0 ? (
                            layout === "list" ? (
                                <div className="bg-white rounded-2xl border divide-y overflow-hidden shadow-sm">
                                    {filteredItems.map(ws => (
                                        <TrashRow key={ws.id} ws={ws} tx={tx}
                                            isSelectionMode={isSelectionMode} isSelected={selectedIds.has(ws.id)}
                                            onSelect={() => isSelectionMode ? toggleSelect(ws.id) : null}
                                            onRestore={async () => { if (!confirm(tx.confirmRestore)) return; await workspaceService.restoreWorkspace(ws.id); fetchTrash(); }}
                                            onDelete={async () => { if (!confirm(tx.confirmDelete)) return; await workspaceService.permanentDeleteWorkspace(ws.id); fetchTrash(); }}
                                        />
                                    ))}
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                                    {filteredItems.map(ws => (
                                        <TrashCard key={ws.id} ws={ws} tx={tx}
                                            isSelectionMode={isSelectionMode} isSelected={selectedIds.has(ws.id)}
                                            onSelect={() => isSelectionMode ? toggleSelect(ws.id) : null}
                                            onRestore={async () => { if (!confirm(tx.confirmRestore)) return; await workspaceService.restoreWorkspace(ws.id); fetchTrash(); }}
                                            onDelete={async () => { if (!confirm(tx.confirmDelete)) return; await workspaceService.permanentDeleteWorkspace(ws.id); fetchTrash(); }}
                                        />
                                    ))}
                                </div>
                            )
                        ) : (
                            <div className="py-20 flex flex-col items-center justify-center border-2 border-dashed rounded-3xl bg-slate-50">
                                <Trash2 className="h-10 w-10 text-slate-200 mb-4" />
                                <p className="text-slate-400 font-bold">{tx.empty}</p>
                            </div>
                        )}
                    </div>
                </div>
            </main>
        </div>
    );
}

type RowProps = {
    ws: WorkspaceData;
    isSelectionMode: boolean;
    isSelected: boolean;
    onSelect: () => void;
    onRestore: () => void;
    onDelete: () => void;
    tx: typeof dict[keyof typeof dict];
};

function TrashRow({ ws, isSelectionMode, isSelected, onSelect, onRestore, onDelete, tx }: RowProps) {
    const createdAt = formatDate(ws.createdAt);
    const deletedAt = formatDate(ws.deletedAt);
    return (
        <div onClick={onSelect}
            className={cn("flex items-center justify-between px-6 py-4 transition-colors group",
                isSelected ? "bg-blue-50/50" : "hover:bg-slate-50 cursor-pointer")}>
            <div className="flex items-center gap-4 min-w-0 flex-1">
                {isSelectionMode ? (
                    <div className="shrink-0">{isSelected ? <CheckSquare className="h-5 w-5 text-blue-600" /> : <Square className="h-5 w-5 text-slate-300" />}</div>
                ) : (
                    <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-slate-400 shrink-0">
                        <Layout className="h-5 w-5" />
                    </div>
                )}
                <div className="min-w-0">
                    <div className="text-sm font-bold text-slate-700 truncate">{ws.name}</div>
                    <div className="flex items-center gap-3 mt-1">
                        {createdAt && (
                            <span className="flex items-center gap-1 text-[11px] text-slate-400">
                                <Calendar className="h-3 w-3 shrink-0" /> {tx.createdLabel} {createdAt}
                            </span>
                        )}
                        {deletedAt && (
                            <span className="flex items-center gap-1 text-[11px] text-red-400">
                                <Clock className="h-3 w-3 shrink-0" /> {tx.deletedLabel} {deletedAt}
                            </span>
                        )}
                    </div>
                </div>
            </div>
            {!isSelectionMode && (
                <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); onRestore(); }} className="text-blue-600 hover:bg-blue-50 h-8 px-3">
                        <RotateCcw className="h-4 w-4 mr-2" /> {tx.restore}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); onDelete(); }} className="text-red-500 hover:bg-red-50 h-8 px-3">
                        <Trash2 className="h-4 w-4 mr-2" /> {tx.deleteForever}
                    </Button>
                </div>
            )}
        </div>
    );
}

function TrashCard({ ws, isSelectionMode, isSelected, onSelect, onRestore, onDelete, tx }: RowProps) {
    const createdAt = formatDate(ws.createdAt);
    const deletedAt = formatDate(ws.deletedAt);
    return (
        <div onClick={onSelect}
            className={cn("group flex flex-col rounded-xl border bg-white p-4 transition-colors shadow-sm cursor-pointer",
                isSelected ? "border-blue-400 bg-blue-50/50" : "hover:border-slate-300 hover:bg-slate-50")}>
            <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-3 min-w-0">
                    {isSelectionMode ? (
                        <div className="shrink-0">{isSelected ? <CheckSquare className="h-5 w-5 text-blue-600" /> : <Square className="h-5 w-5 text-slate-300" />}</div>
                    ) : (
                        <div className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center text-slate-400 shrink-0">
                            <Layout className="h-4 w-4" />
                        </div>
                    )}
                    <p className="text-sm font-bold text-slate-700 truncate">{ws.name}</p>
                </div>
            </div>
            <div className={cn("mt-3 flex flex-col gap-1", isSelectionMode ? "pl-8" : "pl-12")}>
                {createdAt && (
                    <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
                        <Calendar className="h-3 w-3 shrink-0" /><span>{tx.createdLabel} {createdAt}</span>
                    </div>
                )}
                {deletedAt && (
                    <div className="flex items-center gap-1.5 text-[11px] text-red-400">
                        <Clock className="h-3 w-3 shrink-0" /><span>{tx.deletedLabel} {deletedAt}</span>
                    </div>
                )}
            </div>
            {!isSelectionMode && (
                <div className="mt-3 flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity pl-12">
                    <button onClick={(e) => { e.stopPropagation(); onRestore(); }}
                        className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium">
                        <RotateCcw className="h-3.5 w-3.5" /> {tx.restore}
                    </button>
                    <span className="text-slate-200">|</span>
                    <button onClick={(e) => { e.stopPropagation(); onDelete(); }}
                        className="flex items-center gap-1 text-xs text-red-500 hover:text-red-600 font-medium">
                        <Trash2 className="h-3.5 w-3.5" /> {tx.deleteForever}
                    </button>
                </div>
            )}
        </div>
    );
}
