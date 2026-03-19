"use client";

import React from 'react';
import { useAuthState } from '@/features/auth/hooks/useAuthState';
import { signOutCurrentUser } from '@/services/firebase/auth';
import { LogOut, Settings, Languages } from 'lucide-react';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuGroup,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuRadioGroup,
    DropdownMenuRadioItem,
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

export function UserAvatar({ className }: { className?: string }) {
    const { user } = useAuthState();
    const [language, setLanguage] = React.useState<ResponseLanguage>("ja");
    const [menuOpen, setMenuOpen] = React.useState(false);
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
                align="start"
                side="top"
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
                <DropdownMenuGroup>
                    <DropdownMenuItem className="cursor-pointer gap-2 py-2 rounded-md hover:bg-muted transition-colors">
                        <Settings className="w-4 h-4 text-muted-foreground" />
                        <span>Account Settings</span>
                    </DropdownMenuItem>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                    <DropdownMenuLabel className="text-xs uppercase tracking-wide">
                        <span className="inline-flex items-center gap-2">
                            <Languages className="w-3.5 h-3.5" />
                            Language
                        </span>
                    </DropdownMenuLabel>
                    <DropdownMenuRadioGroup value={language} onValueChange={handleLanguageChange}>
                        <DropdownMenuRadioItem value="ja" className="cursor-pointer py-2 rounded-md hover:bg-muted transition-colors">
                            日本語
                        </DropdownMenuRadioItem>
                        <DropdownMenuRadioItem value="en" className="cursor-pointer py-2 rounded-md hover:bg-muted transition-colors">
                            English
                        </DropdownMenuRadioItem>
                    </DropdownMenuRadioGroup>
                </DropdownMenuGroup>
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
