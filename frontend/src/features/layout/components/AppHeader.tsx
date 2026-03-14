import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { env } from '@/lib/env';

export function AppHeader() {
    const isMock = env.NEXT_PUBLIC_USE_MOCKS;

    return (
        <header className="flex items-center h-14 px-4 border-b bg-background shrink-0 w-full z-10">
            <div className="flex items-center space-x-4 flex-1">
                <h1 className="text-sm font-semibold tracking-tight">Act & Organize</h1>
                <Separator orientation="vertical" className="h-6" />
                <div className="text-sm text-muted-foreground flex items-center space-x-2">
                    <span>Workspace</span>
                </div>
            </div>

            <div className="flex items-center space-x-4">
                {isMock && (
                    <Badge variant="secondary" className="bg-yellow-100 text-yellow-800 hover:bg-yellow-100/80">
                        Mock Mode
                    </Badge>
                )}
                <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-xs">
                    U
                </div>
            </div>
        </header>
    );
}
