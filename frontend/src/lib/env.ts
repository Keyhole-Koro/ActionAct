type ClientEnv = {
  NEXT_PUBLIC_USE_MOCKS: boolean;
  NEXT_PUBLIC_RPC_BASE_URL: string;
  NEXT_PUBLIC_ACT_API_BASE_URL: string;
  NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST: string;
  NEXT_PUBLIC_FIRESTORE_EMULATOR_HOST: string;
  NEXT_PUBLIC_GCLOUD_PROJECT: string;
};

function requireEnv(name: keyof Omit<ClientEnv, "NEXT_PUBLIC_USE_MOCKS">): string {
  const value = process.env[name];
  if (!value || value.trim().length === 0) {
    throw new Error(`${name} is required`);
  }
  return value;
}

function requireBooleanEnv(name: "NEXT_PUBLIC_USE_MOCKS"): boolean {
  const value = process.env[name];
  if (value !== "true" && value !== "false") {
    throw new Error(`${name} must be "true" or "false"`);
  }
  return value === "true";
}

export const env: ClientEnv = {
  NEXT_PUBLIC_USE_MOCKS: requireBooleanEnv("NEXT_PUBLIC_USE_MOCKS"),
  NEXT_PUBLIC_RPC_BASE_URL: requireEnv("NEXT_PUBLIC_RPC_BASE_URL"),
  NEXT_PUBLIC_ACT_API_BASE_URL: requireEnv("NEXT_PUBLIC_ACT_API_BASE_URL"),
  NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST: requireEnv("NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST"),
  NEXT_PUBLIC_FIRESTORE_EMULATOR_HOST: requireEnv("NEXT_PUBLIC_FIRESTORE_EMULATOR_HOST"),
  NEXT_PUBLIC_GCLOUD_PROJECT: requireEnv("NEXT_PUBLIC_GCLOUD_PROJECT"),
};
