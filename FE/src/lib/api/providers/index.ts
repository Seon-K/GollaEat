import { apiProvider } from "@/lib/api/providers/apiProvider";
import { mockProvider } from "@/lib/api/providers/mockProvider";
import type { DataMode, DataProvider } from "@/lib/api/providers/types";

export type { DataMode, DataProvider } from "@/lib/api/providers/types";
export { apiProvider } from "@/lib/api/providers/apiProvider";
export { mockProvider } from "@/lib/api/providers/mockProvider";

export function getDataMode(): DataMode {
  const mode = process.env.NEXT_PUBLIC_DATA_MODE;
  return mode === "mock" ? "mock" : "api";
}

export function getDataProvider(): DataProvider {
  return getDataMode() === "mock" ? mockProvider : apiProvider;
}
