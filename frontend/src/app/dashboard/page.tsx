"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
    FolderKanban, Plus, Star, Trash2, Clock, Calendar,
    CheckSquare, Square, ArrowUpDown, LayoutGrid, List, Search,
} from "lucide-react";

import { LoginButton } from "@/features/auth/components/LoginButton";
import { useRequireAuth } from "@/features/auth/hooks/useRequireAuth";
import { UserAvatar } from "@/features/layout/components/UserAvatar";
import { createWorkspace } from "@/features/workspace/services/create-workspace";
import { listUserWorkspaces } from "@/features/workspace/services/list-workspaces";
import { type WorkspaceData, workspaceService } from "@/features/workspace/services/workspace-service";
import { Sidebar } from "@/features/dashboard/components/Sidebar";
import { useFavoritesLimit } from "@/features/dashboard/hooks/useFavoritesLimit";
import { useWorkspaceSelection } from "@/features/dashboard/hooks/useWorkspaceSelection";
import { useLanguage } from "@/features/dashboard/hooks/useLanguage";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type SortKey = "createdAt" | "lastAccessedAt";
type SortDir = "desc" | "asc";
type Layout = "grid" | "list";

const dict = {
    ja: {
        title: "My Workspaces",
        subtitle: "ワークスペースを選んで開く",
        searchPlaceholder: "ワークスペースを検索...",
        newWorkspace: "新規ワークスペース",
        creating: "作成中...",
        noWorkspaces: "ワークスペースがありません",
        noWorkspacesHint: "はじめてのワークスペースを作成しましょう",
        favorites: "お気に入り",
        noFavorites: "お気に入りがありません",
        noFavoritesHint: "カードの ★ をクリックして追加しましょう",
        allWorkspaces: "すべてのワークスペース",
        selectAll: "すべて選択",
        selectedCount: (n: number) => `${n} 件選択中`,
        moveToTrash: "ゴミ箱へ移動",
        moving: "移動中...",
        cancel: "キャンセル",
        select: "選択",
        showMore: (n: number) => `他 ${n} 件を表示`,
        collapse: "折りたたむ",
        lastViewed: "最終閲覧",
        createdAt: "作成日",
        newest: "新しい順",
        oldest: "古い順",
        lastViewedLabel: "最終閲覧:",
        createdLabel: "作成:",
    },
    en: {
        title: "My Workspaces",
        subtitle: "Select a workspace to open",
        searchPlaceholder: "Search workspaces...",
        newWorkspace: "New Workspace",
        creating: "Creating...",
        noWorkspaces: "No workspaces yet",
        noWorkspacesHint: "Create your first workspace to get started",
        favorites: "Favorites",
        noFavorites: "No favorites yet",
        noFavoritesHint: "Click ★ on a card to add it here",
        allWorkspaces: "All Workspaces",
        selectAll: "Select All",
        selectedCount: (n: number) => `${n} selected`,
        moveToTrash: "Move to Trash",
        moving: "Moving...",
        cancel: "Cancel",
        select: "Select",
        showMore: (n: number) => `Show ${n} more`,
        collapse: "Collapse",
        lastViewed: "Last viewed",
        createdAt: "Created",
        newest: "Newest",
        oldest: "Oldest",
        lastViewedLabel: "Viewed:",
        createdLabel: "Created:",
    },
} as const;

function tsToMs(ts: any): number {
    if (!ts) return 0;
    if (typeof ts.toDate === "function") return ts.toDate().getTime();
    return new Date(ts).getTime();
}

function sortWorkspaces(list: WorkspaceData[], key: SortKey, dir: SortDir) {
    return [...list].sort((a, b) => {
        const diff = tsToMs(a[key]) - tsToMs(b[key]);
        return dir === "desc" ? -diff : diff;
    });
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

function LayoutToggle({ value, onChange }: { value: Layout; onChange: (v: Layout) => void }) {
    return (
        <div className="flex items-center rounded-lg border bg-slate-50 p-0.5">
            <button onClick={() => onChange("grid")}
                className={cn("p-1.5 rounded-md transition-colors", value === "grid" ? "bg-white shadow-sm text-slate-700" : "text-slate-400 hover:text-slate-600")}>
                <LayoutGrid className="h-3.5 w-3.5" />
            </button>
            <button onClick={() => onChange("list")}
                className={cn("p-1.5 rounded-md transition-colors", value === "list" ? "bg-white shadow-sm text-slate-700" : "text-slate-400 hover:text-slate-600")}>
                <List className="h-3.5 w-3.5" />
            </button>
        </div>
    );
}

export default function DashboardPage() {
    const { user, loading, isAuthenticated } = useRequireAuth();
    const router = useRouter();
    const lang = useLanguage();
    const tx = dict[lang];

    const [workspaces, setWorkspaces] = useState<WorkspaceData[]>([]);
    const [loadingWorkspaces, setLoadingWorkspaces] = useState(false);
    const [creating, setCreating] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);
    const [searchTerm, setSearchTerm] = useState("");
    const [showAllFavorites, setShowAllFavorites] = useState(false);
    const [sortKey, setSortKey] = useState<SortKey>("lastAccessedAt");
    const [sortDir, setSortDir] = useState<SortDir>("desc");
    const [layoutFav, setLayoutFav] = useState<Layout>("grid");
    const [layoutAll, setLayoutAll] = useState<Layout>("grid");
    const { limit: favoritesLimit } = useFavoritesLimit();
    const { isSelectionMode, setIsSelectionMode, selectedIds, toggleSelect, selectAll, clearSelection } = useWorkspaceSelection();

    const sorted = useMemo(() => {
        const filtered = searchTerm
            ? workspaces.filter(ws => (ws.name || "").toLowerCase().includes(searchTerm.toLowerCase()))
            : workspaces;
        return sortWorkspaces(filtered, sortKey, sortDir);
    }, [workspaces, searchTerm, sortKey, sortDir]);

    const fetchWorkspaces = () => {
        if (!user) return;
        setLoadingWorkspaces(true);
        listUserWorkspaces(user.uid)
            .then(setWorkspaces)
            .catch(console.error)
            .finally(() => setLoadingWorkspaces(false));
    };

    useEffect(() => {
        fetchWorkspaces();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user]);

    const handleSelect = (ws: WorkspaceData) => {
        if (isSelectionMode) { toggleSelect(ws.id); return; }
        router.push(`/workspace/${ws.id}`);
    };

    const handleToggleFavorite = async (e: React.MouseEvent, ws: WorkspaceData) => {
        e.stopPropagation();
        await workspaceService.toggleFavorite(ws.id, !ws.isFavorite);
        setWorkspaces((prev) => prev.map((w) => w.id === ws.id ? { ...w, isFavorite: !w.isFavorite } : w));
    };

    const handleMoveToTrash = async (e: React.MouseEvent, ws: WorkspaceData) => {
        e.stopPropagation();
        if (!confirm(`「${ws.name}」をゴミ箱に移動しますか？`)) return;
        await workspaceService.deleteWorkspace(ws.id);
        setWorkspaces((prev) => prev.filter((w) => w.id !== ws.id));
    };

    const handleBulkMoveToTrash = async () => {
        if (selectedIds.size === 0 || isProcessing) return;
        if (!confirm(`${selectedIds.size} 件をゴミ箱に移動しますか？`)) return;
        setIsProcessing(true);
        try {
            const ids = Array.from(selectedIds);
            setWorkspaces((prev) => prev.filter((w) => !selectedIds.has(w.id)));
            await Promise.all(ids.map((id) => workspaceService.deleteWorkspace(id)));
            clearSelection();
        } catch (error) {
            console.error("Bulk trash error:", error);
            fetchWorkspaces();
        } finally {
            setIsProcessing(false);
        }
    };

    const handleCreate = async () => {
        if (!user || creating) return;
        setCreating(true);
        try {
            const result = await createWorkspace({ uid: user.uid, email: user.email, displayName: user.displayName });
            router.push(`/workspace/${result.workspaceId}?topicId=${result.topicId}`);
        } catch (error) {
            console.error("Failed to create workspace", error);
            setCreating(false);
        }
    };

    if (loading) {
        return <div className="flex h-screen w-full items-center justify-center text-sm text-muted-foreground">Loading...</div>;
    }

    if (!isAuthenticated) {
        return (
            <div className="flex h-screen w-full items-center justify-center">
                <div className="flex max-w-sm flex-col items-center gap-4 rounded-lg border bg-background p-6 text-center">
                    <h2 className="text-lg font-semibold">Sign in to use Act</h2>
                    <LoginButton />
                </div>
            </div>
        );
    }

    const favorites = sorted.filter((ws) => ws.isFavorite);
    const others = sorted.filter((ws) => !ws.isFavorite);
    const sharedCardProps = { isSelectionMode, selectedIds, onSelect: handleSelect, onToggleFavorite: handleToggleFavorite, onMoveToTrash: handleMoveToTrash, tx };

    return (
        <div className="flex h-screen w-full bg-slate-50 overflow-hidden text-slate-900">
            <Sidebar />

            <main className="flex-1 flex flex-col bg-white overflow-hidden">
                <header className="h-16 border-b flex items-center justify-between px-8 shrink-0 gap-4">
                    {/* 左：検索欄 */}
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

                    {/* 右：選択 / 新規作成 / アバター */}
                    <div className="flex items-center gap-3 shrink-0">
                        {isSelectionMode ? (
                            <div className="flex items-center gap-3 animate-in slide-in-from-right-4 duration-200">
                                <Button variant="ghost" size="sm" disabled={isProcessing}
                                    onClick={() => selectAll(workspaces.map((ws) => ws.id))}
                                    className="text-[11px] font-bold text-blue-600 px-2 hover:bg-blue-50">
                                    {tx.selectAll}
                                </Button>
                                <span className="text-xs font-bold text-slate-400 whitespace-nowrap px-2 border-l pl-3">
                                    {tx.selectedCount(selectedIds.size)}
                                </span>
                                <Button onClick={handleBulkMoveToTrash} disabled={selectedIds.size === 0 || isProcessing}
                                    className="bg-red-50 text-red-600 hover:bg-red-100 border-none h-9 px-4 rounded-lg flex items-center shrink-0 font-bold">
                                    <Trash2 className="h-4 w-4 mr-2" />
                                    {isProcessing ? tx.moving : tx.moveToTrash}
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
                        <div className="h-4 w-px bg-slate-200 shrink-0" />
                        <button onClick={() => void handleCreate()} disabled={creating}
                            className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 transition-colors shrink-0">
                            <Plus className="h-4 w-4" />
                            {creating ? tx.creating : tx.newWorkspace}
                        </button>
                        <div className="h-4 w-px bg-slate-200 shrink-0" />
                        <UserAvatar className="h-8 w-8 rounded-full border shadow-sm shrink-0" dropdownSide="bottom" dropdownAlign="end" />
                    </div>
                </header>

                <div className="flex-1 overflow-y-auto p-8">
                    <div className="mx-auto max-w-5xl">
                        <div className="mb-8 flex items-center justify-between">
                            <div>
                                <h1 className="text-xl font-bold">{tx.title}</h1>
                                <p className="mt-1 text-sm text-slate-500">{tx.subtitle}</p>
                            </div>
                            <div className="flex items-center gap-1 rounded-lg border bg-slate-50 p-1 text-xs">
                                <ArrowUpDown className="ml-1 h-3.5 w-3.5 text-slate-400" />
                                <select value={sortKey} onChange={(e) => setSortKey(e.target.value as SortKey)}
                                    className="bg-transparent text-slate-600 outline-none cursor-pointer pr-1">
                                    <option value="lastAccessedAt">{tx.lastViewed}</option>
                                    <option value="createdAt">{tx.createdAt}</option>
                                </select>
                                <select value={sortDir} onChange={(e) => setSortDir(e.target.value as SortDir)}
                                    className="bg-transparent text-slate-600 outline-none cursor-pointer pr-1">
                                    <option value="desc">{tx.newest}</option>
                                    <option value="asc">{tx.oldest}</option>
                                </select>
                            </div>
                        </div>

                        {loadingWorkspaces ? (
                            <div className="text-sm text-slate-400">Loading workspaces...</div>
                        ) : workspaces.length === 0 ? (
                            <div className="flex flex-col items-center gap-4 rounded-2xl border-2 border-dashed p-12 text-center bg-slate-50">
                                <FolderKanban className="h-10 w-10 text-slate-300" />
                                <div>
                                    <p className="font-bold text-slate-600">{tx.noWorkspaces}</p>
                                    <p className="mt-1 text-sm text-slate-400">{tx.noWorkspacesHint}</p>
                                </div>
                            </div>
                        ) : (
                            <div className="space-y-10">
                                {/* Favorites */}
                                <section>
                                    <div className="mb-3 flex items-center justify-between">
                                        <h2 className="flex items-center gap-2 text-sm font-bold text-slate-500 uppercase tracking-wide">
                                            <Star className="h-4 w-4 text-amber-400 fill-amber-400" />
                                            {tx.favorites}
                                        </h2>
                                        {favorites.length > 0 && <LayoutToggle value={layoutFav} onChange={setLayoutFav} />}
                                    </div>
                                    {favorites.length === 0 ? (
                                        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed p-8 text-center bg-slate-50">
                                            <Star className="h-7 w-7 text-slate-200" />
                                            <p className="text-sm font-bold text-slate-400">{tx.noFavorites}</p>
                                            <p className="text-xs text-slate-300">{tx.noFavoritesHint}</p>
                                        </div>
                                    ) : (
                                        <>
                                            <WorkspaceList
                                                workspaces={showAllFavorites ? favorites : favorites.slice(0, favoritesLimit)}
                                                layout={layoutFav}
                                                {...sharedCardProps}
                                            />
                                            {favorites.length > favoritesLimit && (
                                                <button onClick={() => setShowAllFavorites((v) => !v)}
                                                    className="mt-3 text-xs font-medium text-slate-400 hover:text-blue-600 transition-colors">
                                                    {showAllFavorites ? tx.collapse : tx.showMore(favorites.length - favoritesLimit)}
                                                </button>
                                            )}
                                        </>
                                    )}
                                </section>

                                {/* All Workspaces */}
                                <section>
                                    <div className="mb-3 flex items-center justify-between">
                                        <h2 className="text-sm font-bold text-slate-500 uppercase tracking-wide">
                                            {tx.allWorkspaces}
                                        </h2>
                                        <LayoutToggle value={layoutAll} onChange={setLayoutAll} />
                                    </div>
                                    <WorkspaceList workspaces={others} layout={layoutAll} {...sharedCardProps} />
                                </section>
                            </div>
                        )}
                    </div>
                </div>
            </main>
        </div>
    );
}

/* ─── 共通コンポーネント ──────────────────────────────────── */

type CardProps = {
    workspaces: WorkspaceData[];
    layout: Layout;
    isSelectionMode: boolean;
    selectedIds: Set<string>;
    onSelect: (ws: WorkspaceData) => void;
    onToggleFavorite: (e: React.MouseEvent, ws: WorkspaceData) => void;
    onMoveToTrash: (e: React.MouseEvent, ws: WorkspaceData) => void;
    tx: typeof dict[keyof typeof dict];
};

function WorkspaceList(props: CardProps) {
    const { workspaces, layout } = props;
    if (layout === "grid") {
        return (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {workspaces.map((ws) => <GridCard key={ws.id} ws={ws} {...props} />)}
            </div>
        );
    }
    return (
        <div className="rounded-2xl border divide-y overflow-hidden shadow-sm">
            {workspaces.map((ws) => <ListRow key={ws.id} ws={ws} {...props} />)}
        </div>
    );
}

function GridCard({ ws, isSelectionMode, selectedIds, onSelect, onToggleFavorite, onMoveToTrash, tx }: CardProps & { ws: WorkspaceData }) {
    const createdAt = formatDate(ws.createdAt);
    const lastAccessedAt = formatDate(ws.lastAccessedAt);
    const isSelected = selectedIds.has(ws.id);
    return (
        <div onClick={() => onSelect(ws)}
            className={cn(
                "group relative flex flex-col rounded-xl border bg-white p-4 text-left transition-colors shadow-sm cursor-pointer",
                isSelected ? "border-blue-400 bg-blue-50/50" : "hover:border-blue-300 hover:bg-slate-50"
            )}>
            <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-3 min-w-0">
                    {isSelectionMode ? (
                        <div className="shrink-0">
                            {isSelected ? <CheckSquare className="h-5 w-5 text-blue-600" /> : <Square className="h-5 w-5 text-slate-300" />}
                        </div>
                    ) : (
                        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 shrink-0">
                            <FolderKanban className="h-4 w-4 text-blue-600" />
                        </div>
                    )}
                    <p className="text-sm font-bold text-slate-700 truncate">{ws.name}</p>
                </div>
                {!isSelectionMode && (
                    <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={(e) => onToggleFavorite(e, ws)}
                            className={cn("p-1.5 rounded-lg transition-colors", ws.isFavorite ? "text-amber-400 opacity-100" : "text-slate-400 hover:text-amber-400")}>
                            <Star className={cn("h-4 w-4", ws.isFavorite && "fill-amber-400")} />
                        </button>
                        <button onClick={(e) => onMoveToTrash(e, ws)} className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 transition-colors">
                            <Trash2 className="h-4 w-4" />
                        </button>
                    </div>
                )}
            </div>
            {(createdAt || lastAccessedAt) && (
                <div className={cn("mt-3 flex flex-col gap-1", isSelectionMode ? "pl-8" : "pl-12")}>
                    {lastAccessedAt && (
                        <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
                            <Clock className="h-3 w-3 shrink-0" /><span>{tx.lastViewedLabel} {lastAccessedAt}</span>
                        </div>
                    )}
                    {createdAt && (
                        <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
                            <Calendar className="h-3 w-3 shrink-0" /><span>{tx.createdLabel} {createdAt}</span>
                        </div>
                    )}
                </div>
            )}
            {!isSelectionMode && ws.isFavorite && (
                <Star className="absolute top-3 right-3 h-3.5 w-3.5 text-amber-400 fill-amber-400 group-hover:opacity-0 transition-opacity" />
            )}
        </div>
    );
}

function ListRow({ ws, isSelectionMode, selectedIds, onSelect, onToggleFavorite, onMoveToTrash, tx }: CardProps & { ws: WorkspaceData }) {
    const createdAt = formatDate(ws.createdAt);
    const lastAccessedAt = formatDate(ws.lastAccessedAt);
    const isSelected = selectedIds.has(ws.id);
    return (
        <div onClick={() => onSelect(ws)}
            className={cn(
                "flex items-center justify-between px-5 py-3.5 transition-colors group bg-white",
                isSelected ? "bg-blue-50/50" : "hover:bg-slate-50 cursor-pointer"
            )}>
            <div className="flex items-center gap-4 min-w-0 flex-1">
                {isSelectionMode ? (
                    <div className="shrink-0">
                        {isSelected ? <CheckSquare className="h-5 w-5 text-blue-600" /> : <Square className="h-5 w-5 text-slate-300" />}
                    </div>
                ) : (
                    <div className="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center shrink-0">
                        <FolderKanban className="h-4 w-4 text-blue-600" />
                    </div>
                )}
                <div className="min-w-0">
                    <p className="text-sm font-bold text-slate-700 truncate">{ws.name}</p>
                    <div className="flex items-center gap-3 mt-0.5">
                        {lastAccessedAt && (
                            <span className="flex items-center gap-1 text-[11px] text-slate-400">
                                <Clock className="h-3 w-3 shrink-0" />{tx.lastViewedLabel} {lastAccessedAt}
                            </span>
                        )}
                        {createdAt && (
                            <span className="flex items-center gap-1 text-[11px] text-slate-400">
                                <Calendar className="h-3 w-3 shrink-0" />{tx.createdLabel} {createdAt}
                            </span>
                        )}
                    </div>
                </div>
            </div>
            {!isSelectionMode && (
                <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={(e) => onToggleFavorite(e, ws)}
                        className={cn("p-1.5 rounded-lg transition-colors", ws.isFavorite ? "text-amber-400" : "text-slate-300 hover:text-amber-400")}>
                        <Star className={cn("h-4 w-4", ws.isFavorite && "fill-amber-400")} />
                    </button>
                    <button onClick={(e) => onMoveToTrash(e, ws)} className="p-1.5 rounded-lg text-slate-300 hover:text-red-500 transition-colors">
                        <Trash2 className="h-4 w-4" />
                    </button>
                </div>
            )}
        </div>
    );
}
