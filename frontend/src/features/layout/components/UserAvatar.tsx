import React from 'react';
import { useAuthState } from '@/features/auth/hooks/useAuthState';
import { signOutCurrentUser } from '@/services/firebase/auth';
import { LogOut, Settings } from 'lucide-react';
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

export function UserAvatar({ className }: { className?: string }) {
    const { user } = useAuthState();
    const userInitial = user?.displayName?.trim().charAt(0) || user?.email?.trim().charAt(0) || 'U';

    if (!user) {
        return (
            <div className={cn("w-10 h-10 rounded-full bg-gradient-to-br from-muted to-muted/50 border border-border/50 flex items-center justify-center text-sm font-bold text-foreground shadow-sm", className)}>
                {userInitial.toUpperCase()}
            </div>
        );
    }

    return (
        <DropdownMenu>
            <DropdownMenuTrigger className={cn("rounded-full outline-none focus-visible:ring-2 focus-visible:ring-primary ring-offset-2 transition-all group", className)}>
                <Avatar className="h-10 w-10 border border-border/50 shadow-sm cursor-pointer group-hover:scale-105 transition-transform bg-muted">
                    <AvatarImage src={user.photoURL || undefined} alt={user.displayName || "User avatar"} />
                    <AvatarFallback className="bg-gradient-to-br from-muted to-muted/50 text-sm font-bold text-foreground">
                        {userInitial.toUpperCase()}
                    </AvatarFallback>
                </Avatar>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" side="top" className="w-56 p-2 rounded-xl shadow-lg border-border/40 mb-2 ml-2">
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
    );
}
