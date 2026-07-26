import type { AppRPC } from "../main/rpc";

export function createRPCClient(): AppRPC {
  return {
    getAppVersion: async () => "1.3.13-electrobun",
    ping: async () => "pong"
  };
}
