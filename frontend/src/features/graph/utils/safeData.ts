/**
 * Safe accessors for untyped node data records.
 * Eliminates `data.X as string` casts that silently produce undefined at runtime.
 */

type DataRecord = Record<string, unknown>;

export function safeString(data: DataRecord, key: string, fallback = ''): string {
    const value = data[key];
    return typeof value === 'string' ? value : fallback;
}

export function safeOptionalString(data: DataRecord, key: string): string | undefined {
    const value = data[key];
    return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}

export function safeBoolean(data: DataRecord, key: string, fallback = false): boolean {
    const value = data[key];
    return typeof value === 'boolean' ? value : fallback;
}

export function safeArray<T = unknown>(data: DataRecord, key: string): T[] {
    const value = data[key];
    return Array.isArray(value) ? (value as T[]) : [];
}
