"use client";

import { getApp, getApps, initializeApp } from "firebase/app";
import { connectAuthEmulator, getAuth } from "firebase/auth";

import { config } from "@/lib/config";

const firebaseApp = getApps().length > 0
  ? getApp()
  : initializeApp({
      apiKey: config.firebaseApiKey,
      authDomain: config.firebaseAuthDomain,
      appId: config.firebaseAppId,
      projectId: config.gcloudProject,
    });

export const auth = getAuth(firebaseApp);

let authEmulatorConnected = false;
if (config.firebaseAuthEmulatorHost && !authEmulatorConnected) {
  connectAuthEmulator(auth, `http://${config.firebaseAuthEmulatorHost}`, {
    disableWarnings: true,
  });
  authEmulatorConnected = true;
}

export { firebaseApp };

