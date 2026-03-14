import localConfig from "@/config/local.json";
import prodConfig from "@/config/prod.json";

export type FrontendConfig = {
  useMocks: boolean;
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

export const config: FrontendConfig = {
  useMocks: staticConfig.useMocks,
  rpcBaseUrl: staticConfig.rpcBaseUrl,
  actApiBaseUrl: staticConfig.actApiBaseUrl,
  firebaseApiKey: staticConfig.firebaseApiKey,
  firebaseAuthDomain: staticConfig.firebaseAuthDomain,
  firebaseAppId: staticConfig.firebaseAppId,
  firebaseAuthEmulatorHost: staticConfig.firebaseAuthEmulatorHost,
  firestoreEmulatorHost: staticConfig.firestoreEmulatorHost,
  gcloudProject: staticConfig.gcloudProject,
};
