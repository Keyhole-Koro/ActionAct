"use client";

import React from 'react';
import { useAuthState } from '@/features/auth/hooks/useAuthState';
import { signOutCurrentUser } from '@/services/firebase/auth';
import { LogOut, Settings, Languages, ChevronDown } from 'lucide-react';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuGroup,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from '@/lib/utils';
import {
    getResponseLanguagePreference,
    setResponseLanguagePreference,
    subscribeResponseLanguagePreference,
    type ResponseLanguage,
} from '@/lib/response-language-preference';
import { useStreamPreferencesStore } from '@/features/agentTools/store/stream-preferences-store';

export function UserAvatar({
    className,
    dropdownSide = "top",
    dropdownAlign = "start",
}: {
    className?: string;
    dropdownSide?: "top" | "bottom" | "left" | "right";
    dropdownAlign?: "start" | "center" | "end";
}) {
    const { user } = useAuthState();
    const [language, setLanguage] = React.useState<ResponseLanguage>("ja");
    const [menuOpen, setMenuOpen] = React.useState(false);
    const [accountOpen, setAccountOpen] = React.useState(false);
    const [userSettingsOpen, setUserSettingsOpen] = React.useState(false);
    const collapseThresholdMinutes = useStreamPreferencesStore((state) => state.collapseThresholdMinutes);
    const setStreamPreferences = useStreamPreferencesStore((state) => state.setPreferences);
    const closeTimerRef = React.useRef<number | null>(null);
    const userInitial = user?.displayName?.trim().charAt(0) || user?.email?.trim().charAt(0) || 'U';

    React.useEffect(() => {
        const next = getResponseLanguagePreference();
        setLanguage(next);

        return subscribeResponseLanguagePreference((updatedLanguage) => {
            setLanguage(updatedLanguage);
        });
    }, []);

    React.useEffect(() => {
        return () => {
            if (closeTimerRef.current !== null && typeof window !== "undefined") {
                window.clearTimeout(closeTimerRef.current);
            }
        };
    }, []);

    const clearCloseTimer = () => {
        if (closeTimerRef.current !== null && typeof window !== "undefined") {
            window.clearTimeout(closeTimerRef.current);
            closeTimerRef.current = null;
        }
    };

    const openMenu = () => {
        clearCloseTimer();
        setMenuOpen(true);
    };

    const scheduleCloseMenu = () => {
        clearCloseTimer();
        if (typeof window === "undefined") {
            setMenuOpen(false);
            return;
        }
        closeTimerRef.current = window.setTimeout(() => {
            setMenuOpen(false);
            closeTimerRef.current = null;
        }, 140);
    };

    const handleLanguageChange = (value: string) => {
        if (value !== "ja" && value !== "en") {
            return;
        }
        setResponseLanguagePreference(value);
    };

    if (!user) {
        return (
            <div className={cn("w-10 h-10 rounded-full bg-gradient-to-br from-muted to-muted/50 border border-border/50 flex items-center justify-center text-sm font-bold text-foreground shadow-sm", className)}>
                {userInitial.toUpperCase()}
            </div>
        );
    }

    return (
        <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
            <DropdownMenuTrigger
                className={cn("rounded-full outline-none focus-visible:ring-2 focus-visible:ring-primary ring-offset-2 transition-all group", className)}
                onMouseEnter={openMenu}
                onMouseLeave={scheduleCloseMenu}
                onFocus={openMenu}
            >
                <Avatar className="h-10 w-10 border border-border/50 shadow-sm cursor-pointer group-hover:scale-105 transition-transform bg-muted">
                    <AvatarImage src={user.photoURL || undefined} alt={user.displayName || "User avatar"} />
                    <AvatarFallback className="bg-gradient-to-br from-muted to-muted/50 text-sm font-bold text-foreground">
                        {userInitial.toUpperCase()}
                    </AvatarFallback>
                </Avatar>
            </DropdownMenuTrigger>
            <DropdownMenuContent
                align={dropdownAlign}
                side={dropdownSide}
                className="w-56 p-2 rounded-xl shadow-lg border-border/40 mb-2 ml-2"
                onMouseEnter={openMenu}
                onMouseLeave={scheduleCloseMenu}
                onFocus={openMenu}
            >
                <DropdownMenuGroup>
                    <DropdownMenuLabel className="font-normal">
                        <div className="flex flex-col space-y-1">
                            <p className="text-sm font-medium leading-none">
                                {user.displayName || 'User'}
                            </p>
                            <p className="text-xs leading-none text-muted-foreground truncate" title={user.email || ''}>
                                {user.email || 'No email'}
                            </p>
                        </div>
                    </DropdownMenuLabel>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <div className="space-y-0.5">
                    <button
                        type="button"
                        className="w-full flex items-center gap-2 px-2 py-1.5 text-sm rounded-md hover:bg-muted transition-colors"
                        onClick={() => setAccountOpen((v) => !v)}
                    >
                        <Settings className="w-4 h-4 text-muted-foreground shrink-0" />
                        <span className="flex-1 text-left">Account Settings</span>
                        <ChevronDown className={cn("w-3.5 h-3.5 text-muted-foreground transition-transform", accountOpen && "rotate-180")} />
                    </button>
                    {accountOpen && (
                        <div className="space-y-0.5">
                            <p className="px-2 py-1 text-xs text-muted-foreground flex items-center gap-1.5">
                                <Languages className="w-3.5 h-3.5" /> Language
                            </p>
                            {(["ja", "en"] as const).map((lang) => (
                                <button
                                    key={lang}
                                    type="button"
                                    className={cn("w-full flex items-center gap-2 pl-6 pr-2 py-1.5 text-sm rounded-md hover:bg-muted transition-colors", language === lang && "text-primary")}
                                    onClick={() => handleLanguageChange(lang)}
                                >
                                    <span className={cn("w-2 h-2 rounded-full border shrink-0", language === lang ? "bg-primary border-primary" : "border-muted-foreground")} />
                                    {lang === "ja" ? "日本語" : "English"}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
                <DropdownMenuSeparator />
                <div className="space-y-0.5">
                    <button
                        type="button"
                        className="w-full flex items-center gap-2 px-2 py-1.5 text-sm rounded-md hover:bg-muted transition-colors"
                        onClick={() => setUserSettingsOpen((v) => !v)}
                    >
                        <span className="flex-1 text-left">User Settings</span>
                        <ChevronDown className={cn("w-3.5 h-3.5 text-muted-foreground transition-transform", userSettingsOpen && "rotate-180")} />
                    </button>
                    {userSettingsOpen && (
                        <div className="space-y-0.5">
                            <p className="px-2 py-1 text-xs text-muted-foreground">Auto-close unused nodes</p>
                            {([1, 3, 5, 15, 60, 9999] as const).map((min) => (
                                <button
                                    key={min}
                                    type="button"
                                    className={cn("w-full flex items-center gap-2 pl-6 pr-2 py-1.5 text-sm rounded-md hover:bg-muted transition-colors", collapseThresholdMinutes === min && "text-primary")}
                                    onClick={() => setStreamPreferences({ collapseThresholdMinutes: min })}
                                >
                                    <span className={cn("w-2 h-2 rounded-full border shrink-0", collapseThresholdMinutes === min ? "bg-primary border-primary" : "border-muted-foreground")} />
                                    {min === 9999 ? 'なし' : min < 60 ? `${min}分` : '1時間'}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                    onClick={() => void signOutCurrentUser()}
                    className="cursor-pointer gap-2 py-2 rounded-md hover:bg-destructive/10 text-destructive focus:bg-destructive/10 focus:text-destructive transition-colors"
                >
                    <LogOut className="w-4 h-4" />
                    <span>Log out</span>
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
