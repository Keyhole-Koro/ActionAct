import type { NextRequest } from "next/server";

import { proxyActApiRequest } from "@/app/_lib/act-api-proxy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UPSTREAM_PATH = "/auth/session/bootstrap";

export async function POST(request: NextRequest) {
  return proxyActApiRequest(request, UPSTREAM_PATH);
}

export async function OPTIONS(request: NextRequest) {
  return proxyActApiRequest(request, UPSTREAM_PATH);
}
