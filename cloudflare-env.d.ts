declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
  }
}

interface ImportMetaEnv {
  readonly VITE_ZAKUPAI_LOCAL_PREVIEW?: string;
}
