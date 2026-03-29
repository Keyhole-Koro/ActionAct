"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Layout, Trash2, Settings, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { useRequireAuth } from "@/features/auth/hooks/useRequireAuth";
import { workspaceService } from "@/features/workspace/services/workspace-service";
import { useFavoritesLimit } from "@/features/dashboard/hooks/useFavoritesLimit";

export function Sidebar() {
    const { user } = useRequireAuth();
    const router = useRouter();
    const pathname = usePathname();
    const [trashCount, setTrashCount] = useState(0);
    const [settingsOpen, setSettingsOpen] = useState(false);
    const { limit, setLimit } = useFavoritesLimit();

    useEffect(() => {
        if (!user) return;
        const fetchCount = async () => {
            try {
                const trash = await workspaceService.listTrashWorkspaces(user.uid);
                setTrashCount(trash.length);
            } catch (e) {
                console.error("Trash count error:", e);
            }
        };
        fetchCount();
        window.addEventListener("focus", fetchCount);
        return () => window.removeEventListener("focus", fetchCount);
    }, [user]);

    const menuItems = [
        { id: "all", label: "My Workspaces", icon: Layout, path: "/dashboard" },
        { id: "trash", label: "Trash", icon: Trash2, path: "/dashboard/trash", count: trashCount },
    ];

    return (
        <aside className="w-64 border-r bg-slate-900 flex flex-col shrink-0 text-slate-300">
            <div className="p-6 flex-1">
                <div className="flex items-center gap-3 px-2 mb-8 cursor-pointer" onClick={() => router.push("/dashboard")}>
                    <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white font-bold">A</div>
                    <span className="font-bold text-white tracking-tight text-lg">Action</span>
                </div>

                <nav className="space-y-1">
                    {menuItems.map((item) => (
                        <button
                            key={item.id}
                            onClick={() => router.push(item.path)}
                            className={cn(
                                "w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-medium transition-all group",
                                pathname === item.path
                                    ? "bg-blue-600 text-white shadow-lg shadow-blue-900/20"
                                    : "hover:bg-slate-800 hover:text-slate-100"
                            )}
                        >
                            <div className="flex items-center gap-3">
                                <item.icon className={cn("h-4 w-4", pathname === item.path ? "text-white" : "text-slate-500 group-hover:text-slate-300")} />
                                {item.label}
                            </div>
                            {item.count !== undefined && item.count > 0 && (
                                <span className={cn(
                                    "px-2 py-0.5 rounded-full text-[10px] font-bold",
                                    pathname === item.path ? "bg-blue-500 text-white" : "bg-slate-800 text-slate-400"
                                )}>
                                    {item.count}
                                </span>
                            )}
                        </button>
                    ))}
                </nav>
            </div>

            <div className="p-6 border-t border-slate-800/50 space-y-2">
                <button
                    onClick={() => setSettingsOpen((prev) => !prev)}
                    className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm hover:bg-slate-800 transition-colors text-slate-500 hover:text-slate-300"
                >
                    <div className="flex items-center gap-3">
                        <Settings className="h-4 w-4" />
                        設定
                    </div>
                    {settingsOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                </button>

                {settingsOpen && (
                    <div className="rounded-xl bg-slate-800 p-4 space-y-4">
                        <div>
                            <label className="block text-xs font-bold text-slate-400 mb-2">
                                お気に入りの表示件数
                            </label>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => setLimit(limit - 1)}
                                    disabled={limit <= 1}
                                    className="w-7 h-7 rounded-lg bg-slate-700 text-slate-300 hover:bg-slate-600 disabled:opacity-30 transition-colors text-sm font-bold flex items-center justify-center"
                                >
                                    −
                                </button>
                                <input
                                    type="number"
                                    min={1}
                                    value={limit}
                                    onChange={(e) => {
                                        const v = parseInt(e.target.value, 10);
                                        if (!isNaN(v)) setLimit(v);
                                    }}
                                    className="w-12 text-center bg-slate-700 text-white text-sm rounded-lg py-1 outline-none focus:ring-1 ring-blue-500 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
                                />
                                <button
                                    onClick={() => setLimit(limit + 1)}
                                    className="w-7 h-7 rounded-lg bg-slate-700 text-slate-300 hover:bg-slate-600 transition-colors text-sm font-bold flex items-center justify-center"
                                >
                                    ＋
                                </button>
                                <span className="text-xs text-slate-500">件まで</span>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </aside>
    );
}
