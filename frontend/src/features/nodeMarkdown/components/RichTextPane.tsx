import React from 'react';

import { MarkdownPane } from './MarkdownPane';

type RichTextPaneProps = {
    content?: string | null;
    className?: string;
    markdownClassName?: string;
    htmlClassName?: string;
};

function looksLikeHtml(value: string) {
    return /<\/?[a-z][\s\S]*>/i.test(value);
}

export function RichTextPane({
    content,
    className,
    markdownClassName,
    htmlClassName,
}: RichTextPaneProps) {
    if (!content) {
        return null;
    }

    if (looksLikeHtml(content)) {
        return (
            <div
                className={htmlClassName ?? className}
                dangerouslySetInnerHTML={{ __html: content }}
            />
        );
    }

    return (
        <MarkdownPane
            content={content}
            className={markdownClassName ?? className}
        />
    );
}
