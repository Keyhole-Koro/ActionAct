import React from 'react';

export function LeftRail() {
    return (
        <div className="h-full w-full bg-background border-r flex flex-col p-4">
            <div className="font-medium text-sm text-muted-foreground mb-4">
                Knowledge Tree
            </div>
            <div className="flex-1 overflow-auto -mx-4 px-4">
                <div className="text-sm text-muted-foreground italic">
                    Tree view placeholder...
                </div>
            </div>
        </div>
    );
}
