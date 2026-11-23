/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_DATA_MODE?: string;
  readonly VITE_API_PROXY_TARGET?: string;
  readonly VITE_KAKAO_MAP_APP_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare module "*.svg?url" {
  const src: string;
  export default src;
}
