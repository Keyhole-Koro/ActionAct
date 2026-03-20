import type { NextRequest } from "next/server";

import { proxyActApiRequest } from "@/app/_lib/act-api-proxy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function handle(request: NextRequest, params: Promise<{ method: string }>) {
  const { method } = await params;
  return proxyActApiRequest(request, `/act.v1.ActService/${method}${request.nextUrl.search}`);
}

export async function POST(request: NextRequest, context: { params: Promise<{ method: string }> }) {
  return handle(request, context.params);
}

export async function OPTIONS(request: NextRequest, context: { params: Promise<{ method: string }> }) {
  return handle(request, context.params);
}
