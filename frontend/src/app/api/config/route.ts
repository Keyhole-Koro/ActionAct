import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    rpcBaseUrl: process.env.NEXT_PUBLIC_RPC_BASE_URL || "",
    actApiBaseUrl: process.env.NEXT_PUBLIC_ACT_API_BASE_URL || "",
    firebaseApiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "",
    firebaseAuthDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "",
    firebaseAppId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "",
    firebaseAuthEmulatorHost: process.env.NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST || "",
    firestoreEmulatorHost: process.env.NEXT_PUBLIC_FIRESTORE_EMULATOR_HOST || "",
    gcloudProject: process.env.NEXT_PUBLIC_GCLOUD_PROJECT || "prod",
  });
}
