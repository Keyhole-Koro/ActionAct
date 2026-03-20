import React from 'react';
import { useAuthState } from '@/features/auth/hooks/useAuthState';
import { signOutCurrentUser } from '@/services/firebase/auth';
import { useRunContextStore } from '@/features/context/store/run-context-store';
import { AddMemberControl } from '@/features/workspace/components/AddMemberControl';
import { DiscordConnectControl } from '@/features/workspace/components/DiscordConnectControl';
import { Sparkles, FolderKanban, LogOut, Settings } from 'lucide-react';
import { UploadButton } from '@/features/action/actionOrganize/components/UploadButton';
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

export function AppHeader() {
    const { workspaceId } = useRunContextStore();
    const { user } = useAuthState();
    const userInitial = user?.displayName?.trim().charAt(0) || user?.email?.trim().charAt(0) || 'U';

    return (
        <header className="flex flex-col justify-center h-16 px-6 border-b bg-white/90 backdrop-blur-xl shrink-0 w-full z-10 sticky top-0 shadow-sm">
            <div className="flex items-center justify-between w-full">

                {/* Brand & Context */}
                <div className="flex items-center gap-6">
                    <div className="flex items-center gap-2 group cursor-default">
                        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary/80 to-primary/40 flex items-center justify-center shadow-sm group-hover:scale-105 transition-all duration-300">
                            <Sparkles className="w-4 h-4 text-white" />
                        </div>
                        <h1 className="text-lg font-bold tracking-tight text-foreground">
                            Act
                        </h1>
                    </div>

                    <div className="h-6 w-px bg-border/60" />

                    <div className="flex items-center gap-4 text-sm">
                        <div className="flex items-center gap-2 text-muted-foreground group">
                            <FolderKanban className="w-4 h-4 group-hover:text-primary transition-colors" />
                            <span className="font-medium truncate max-w-[150px]" title={workspaceId}>
                                {workspaceId}
                            </span>
                        </div>
                    </div>
                </div>

                {/* Status & User */}
                <div className="flex items-center gap-4">
                    <DiscordConnectControl workspaceId={workspaceId} />
                    <AddMemberControl workspaceId={workspaceId} />
                    <UploadButton />

                    <div className="flex items-center gap-3">
                        {user ? (
                            <DropdownMenu>
                                <DropdownMenuTrigger className="rounded-full outline-none focus-visible:ring-2 focus-visible:ring-primary ring-offset-2 transition-all">
                                    <Avatar className="h-9 w-9 border border-border/50 shadow-sm cursor-pointer hover:opacity-80 transition-opacity bg-muted">
                                        <AvatarImage src={user.photoURL || undefined} alt={user.displayName || "User avatar"} />
                                        <AvatarFallback className="bg-gradient-to-br from-muted to-muted/50 text-sm font-bold text-foreground">
                                            {userInitial.toUpperCase()}
                                        </AvatarFallback>
                                    </Avatar>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-56 p-2 rounded-xl shadow-lg border-border/40">
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
                                    <DropdownMenuItem
                                        onClick={() => void signOutCurrentUser()}
                                        className="cursor-pointer gap-2 py-2 rounded-md hover:bg-destructive/10 text-destructive focus:bg-destructive/10 focus:text-destructive transition-colors"
                                    >
                                        <LogOut className="w-4 h-4" />
                                        <span>Log out</span>
                                    </DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        ) : (
                            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-muted to-muted/50 border border-border/50 flex items-center justify-center text-sm font-bold text-foreground shadow-sm">
                                {userInitial.toUpperCase()}
                            </div>
                        )}
                    </div>
                </div>

            </div>
        </header>
    );
}
