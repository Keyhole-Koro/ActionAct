import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeSanitize from 'rehype-sanitize';

interface MarkdownPaneProps {
    content: string;
}

export function MarkdownPane({ content }: MarkdownPaneProps) {
    if (!content) {
        return <div className="text-muted-foreground italic">No content available.</div>;
    }

    return (
        <div className="prose prose-sm dark:prose-invert max-w-none prose-headings:font-medium prose-a:text-primary">
            <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                rehypePlugins={[rehypeSanitize]}
            >
                {content}
            </ReactMarkdown>
        </div>
    );
}
