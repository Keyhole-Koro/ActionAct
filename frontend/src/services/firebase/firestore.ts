"use client";

import { connectFirestoreEmulator, getFirestore } from "firebase/firestore";

import { firebaseApp } from "@/services/firebase/app";
import { config } from "@/lib/config";

export const firestore = getFirestore(firebaseApp);

let firestoreEmulatorConnected = false;

if (config.firestoreEmulatorHost && !firestoreEmulatorConnected) {
  const [host, rawPort] = config.firestoreEmulatorHost.split(":");
  const port = Number(rawPort);
  if (host && Number.isInteger(port)) {
    connectFirestoreEmulator(firestore, host, port);
    firestoreEmulatorConnected = true;
  }
}
