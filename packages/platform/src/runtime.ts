import type { IndieCutBridge } from "./types";

let platform: IndieCutBridge | null = null;

export function setPlatform(bridge: IndieCutBridge): void {
  platform = bridge;
}

export function getPlatform(): IndieCutBridge | null {
  return platform;
}

export function requirePlatform(): IndieCutBridge {
  if (!platform) {
    throw new Error("IndieCut platform bridge unavailable");
  }
  return platform;
}
