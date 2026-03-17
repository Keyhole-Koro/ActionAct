"use client";

import React, { useRef, useLayoutEffect } from 'react';

interface HtmlPreviewProps {
    html: string;
    className?: string;
}

/**
 * Renders HTML and CSS inside a Shadow DOM to ensure style isolation.
 * Lightweight alternative to iframe for AI-generated content.
 */
export function HtmlPreview({ html, className }: HtmlPreviewProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const shadowRootRef = useRef<ShadowRoot | null>(null);

    useLayoutEffect(() => {
        if (!containerRef.current) return;

        // Initialize shadow root if not exists
        if (!shadowRootRef.current) {
            shadowRootRef.current = containerRef.current.attachShadow({ mode: 'open' });
        }

        // Set the content
        if (shadowRootRef.current) {
            shadowRootRef.current.innerHTML = html;
        }
    }, [html]);

    return (
        <div 
            ref={containerRef} 
            className={className} 
            style={{ all: 'initial' }}
        />
    );
}
