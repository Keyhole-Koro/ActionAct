import type { NextRequest } from "next/server";

import { config } from "@/lib/config";

const HOP_BY_HOP_HEADERS = new Set([
  "connection",
  "content-length",
  "host",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);

function buildUpstreamHeaders(request: NextRequest): Headers {
  const headers = new Headers();

  request.headers.forEach((value, key) => {
    if (!HOP_BY_HOP_HEADERS.has(key.toLowerCase())) {
      headers.set(key, value);
    }
  });

  return headers;
}

export async function proxyActApiRequest(request: NextRequest, upstreamPath: string): Promise<Response> {
  const upstreamURL = new URL(upstreamPath, config.actApiUpstreamBaseUrl);
  const headers = buildUpstreamHeaders(request);
  const hasBody = request.method !== "GET" && request.method !== "HEAD";
  const upstreamInit: RequestInit & { duplex?: "half" } = {
    method: request.method,
    headers,
    body: hasBody ? request.body : undefined,
    redirect: "manual",
    cache: "no-store",
  };
  if (hasBody) {
    upstreamInit.duplex = "half";
  }

  const upstream = await fetch(upstreamURL, upstreamInit);

  const responseHeaders = new Headers();
  upstream.headers.forEach((value, key) => {
    if (!HOP_BY_HOP_HEADERS.has(key.toLowerCase())) {
      responseHeaders.append(key, value);
    }
  });

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: responseHeaders,
  });
}
