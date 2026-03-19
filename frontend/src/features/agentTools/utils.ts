export function uniqueNodeIds(nodeIds: string[]): string[] {
    const seen = new Set<string>();
    const ordered: string[] = [];
    nodeIds.forEach((nodeId) => {
        const normalized = nodeId.trim();
        if (!normalized || seen.has(normalized)) {
            return;
        }
        seen.add(normalized);
        ordered.push(normalized);
    });
    return ordered;
}

export function isLikelyJapanese(text: string): boolean {
    return /[\u3040-\u30ff\u3400-\u9fff]/u.test(text);
}
