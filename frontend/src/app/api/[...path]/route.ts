import type { NextRequest } from "next/server";

import { proxyActApiRequest } from "@/app/_lib/act-api-proxy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function toUpstreamPath(path: string[] | undefined, search: string): string {
  const joined = Array.isArray(path) ? path.join("/") : "";
  return `/api/${joined}${search}`;
}

async function handle(request: NextRequest, params: Promise<{ path?: string[] }>) {
  const { path } = await params;
  return proxyActApiRequest(request, toUpstreamPath(path, request.nextUrl.search));
}

export async function GET(request: NextRequest, context: { params: Promise<{ path?: string[] }> }) {
  return handle(request, context.params);
}

export async function POST(request: NextRequest, context: { params: Promise<{ path?: string[] }> }) {
  return handle(request, context.params);
}

export async function PUT(request: NextRequest, context: { params: Promise<{ path?: string[] }> }) {
  return handle(request, context.params);
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ path?: string[] }> }) {
  return handle(request, context.params);
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ path?: string[] }> }) {
  return handle(request, context.params);
}

export async function OPTIONS(request: NextRequest, context: { params: Promise<{ path?: string[] }> }) {
  return handle(request, context.params);
}
