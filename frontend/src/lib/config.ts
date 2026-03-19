import localConfig from "@/config/local.json";
import prodConfig from "@/config/prod.json";

export type FrontendConfig = {
  rpcBaseUrl: string;
  actApiBaseUrl: string;
  firebaseApiKey: string;
  firebaseAuthDomain: string;
  firebaseAppId: string;
  firebaseAuthEmulatorHost: string;
  firestoreEmulatorHost: string;
  gcloudProject: string;
};

const staticConfig = process.env.NODE_ENV === "production" ? prodConfig : localConfig;

function readRequiredString(value: unknown, fieldName: keyof FrontendConfig): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${fieldName} is required`);
  }
  return value;
}

export const config: FrontendConfig = {
  rpcBaseUrl: readRequiredString(staticConfig.rpcBaseUrl, "rpcBaseUrl"),
  actApiBaseUrl: readRequiredString(staticConfig.actApiBaseUrl, "actApiBaseUrl"),
  firebaseApiKey: readRequiredString(staticConfig.firebaseApiKey, "firebaseApiKey"),
  firebaseAuthDomain: readRequiredString(staticConfig.firebaseAuthDomain, "firebaseAuthDomain"),
  firebaseAppId: readRequiredString(staticConfig.firebaseAppId, "firebaseAppId"),
  firebaseAuthEmulatorHost: typeof staticConfig.firebaseAuthEmulatorHost === "string" ? staticConfig.firebaseAuthEmulatorHost : "",
  firestoreEmulatorHost: typeof staticConfig.firestoreEmulatorHost === "string" ? staticConfig.firestoreEmulatorHost : "",
  gcloudProject: readRequiredString(staticConfig.gcloudProject, "gcloudProject"),
};
