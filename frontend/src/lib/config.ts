import localConfig from "@/config/local.json";
import prodConfig from "@/config/prod.json";

export type FrontendConfig = {
  rpcBaseUrl: string;
  actApiBaseUrl: string;
  actApiUpstreamBaseUrl: string;
  firebaseApiKey: string;
  firebaseAuthDomain: string;
  firebaseAppId: string;
  firebaseAuthEmulatorHost: string;
  firestoreEmulatorHost: string;
  gcloudProject: string;
  requireBootstrapCsrfHeader: boolean;
  useActApiProxy: boolean;
};

type BooleanConfigKey = "requireBootstrapCsrfHeader" | "useActApiProxy";
type StaticStringConfigKey = Exclude<keyof FrontendConfig, BooleanConfigKey | "actApiUpstreamBaseUrl">;

const isProd = process.env.NODE_ENV === "production";
const staticConfig = isProd ? prodConfig : localConfig;
const publicEnv = {
  rpcBaseUrl: process.env.NEXT_PUBLIC_RPC_BASE_URL,
  actApiBaseUrl: process.env.NEXT_PUBLIC_ACT_API_BASE_URL,
  firebaseApiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  firebaseAuthDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  firebaseAppId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  firebaseAuthEmulatorHost: process.env.NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST,
  firestoreEmulatorHost: process.env.NEXT_PUBLIC_FIRESTORE_EMULATOR_HOST,
  gcloudProject: process.env.NEXT_PUBLIC_GCLOUD_PROJECT,
} satisfies Partial<Record<StaticStringConfigKey, string>>;

function getConfigValue(fieldName: StaticStringConfigKey): string {
  const envValue = publicEnv[fieldName];
  if (envValue && envValue.trim() !== "") {
    return envValue;
  }

  const configValue = staticConfig[fieldName];
  if (typeof configValue === "string" && configValue.trim() !== "") {
    return configValue;
  }

  return "";
}

function getBooleanConfigValue(fieldName: BooleanConfigKey): boolean {
  const configValue = staticConfig[fieldName];
  if (typeof configValue === "boolean") {
    return configValue;
  }

  return false;
}

function validateConfig(c: FrontendConfig): FrontendConfig {
  const missing: string[] = [];
  const invalid: string[] = [];
  for (const [key, value] of Object.entries(c)) {
    if (typeof value === "boolean") continue;
    if (key === "firebaseAuthEmulatorHost" || key === "firestoreEmulatorHost") continue;
    if (c.useActApiProxy && (key === "rpcBaseUrl" || key === "actApiBaseUrl")) continue;

    if (value === "") {
      missing.push(key);
      continue;
    }

    if (
      value === "replace-me" ||
      value === "replace-me.firebaseapp.com" ||
      value === "prod"
    ) {
      invalid.push(key);
    }
  }

  const issues = [
    missing.length > 0 ? `missing: ${missing.join(", ")}` : null,
    invalid.length > 0 ? `invalid: ${invalid.join(", ")}` : null,
  ].filter(Boolean);

  if (issues.length > 0) {
    throw new Error(`Frontend config is invalid (${issues.join("; ")})`);
  }

  return c;
}

export const config: FrontendConfig = validateConfig({
  rpcBaseUrl: getBooleanConfigValue("useActApiProxy") ? "" : getConfigValue("rpcBaseUrl"),
  actApiBaseUrl: getBooleanConfigValue("useActApiProxy") ? "" : getConfigValue("actApiBaseUrl"),
  actApiUpstreamBaseUrl: getConfigValue("actApiBaseUrl"),
  firebaseApiKey: getConfigValue("firebaseApiKey"),
  firebaseAuthDomain: getConfigValue("firebaseAuthDomain"),
  firebaseAppId: getConfigValue("firebaseAppId"),
  firebaseAuthEmulatorHost: getConfigValue("firebaseAuthEmulatorHost"),
  firestoreEmulatorHost: getConfigValue("firestoreEmulatorHost"),
  gcloudProject: getConfigValue("gcloudProject"),
  requireBootstrapCsrfHeader: getBooleanConfigValue("requireBootstrapCsrfHeader"),
  useActApiProxy: getBooleanConfigValue("useActApiProxy"),
});
