"use client";

import { config } from "@/lib/config";
import { getFirebaseIdToken } from "@/services/firebase/token";

export interface UploadedMediaRef {
    mimeType: string;
    gcsObjectKey: string;
    sizeBytes: number;
}

/**
 * Uploads a file to GCS via the presign flow:
 * 1. POST /api/upload/presign  → get signed (or proxy) upload URL + object key
 * 2. PUT {upload_url}          → upload file bytes directly
 *
 * Returns a MediaRef that can be passed to streamAct as userMediaRefs.
 */
export async function uploadFileForAct(
    workspaceId: string,
    file: File,
    onProgress?: (percent: number) => void,
): Promise<UploadedMediaRef> {
    const idToken = await getFirebaseIdToken();
    const apiBase = config.actApiBaseUrl;

    // Step 1: get presigned URL
    const presignRes = await fetch(`${apiBase}/api/upload/presign`, {
        method: "POST",
        credentials: "include",
        headers: {
            "Content-Type": "application/json",
            ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
        },
        body: JSON.stringify({
            workspace_id: workspaceId,
            mime_type: file.type || "application/octet-stream",
        }),
    });

    if (!presignRes.ok) {
        const msg = await presignRes.text().catch(() => "");
        throw new Error(`presign failed (${presignRes.status}): ${msg}`);
    }

    const { object_key, upload_url } = await presignRes.json() as {
        object_key: string;
        upload_url: string;
        expires_at: string;
    };

    // Step 2: upload directly to GCS (or act-api proxy in local dev)
    // Use XMLHttpRequest so we can track upload progress.
    await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("PUT", upload_url);
        xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");

        if (onProgress) {
            xhr.upload.addEventListener("progress", (e) => {
                if (e.lengthComputable) {
                    onProgress(Math.round((e.loaded / e.total) * 100));
                }
            });
        }

        xhr.onload = () => {
            // GCS returns 200 for signed URL PUT; proxy returns 204.
            if (xhr.status === 200 || xhr.status === 204) {
                resolve();
            } else {
                reject(new Error(`upload failed (${xhr.status}): ${xhr.responseText}`));
            }
        };
        xhr.onerror = () => reject(new Error("upload network error"));
        xhr.send(file);
    });

    return {
        mimeType: file.type || "application/octet-stream",
        gcsObjectKey: object_key,
        sizeBytes: file.size,
    };
}
