export interface AppRPC {
  getAppVersion: () => Promise<string>;
  ping: () => Promise<string>;
}

export function registerRPCHandlers() {
  return {
    getAppVersion: async () => "1.3.13-electrobun",
    ping: async () => "pong"
  };
}
