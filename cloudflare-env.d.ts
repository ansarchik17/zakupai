declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    ZAKUPAI_ADMIN_EMAIL?: string;
    ZAKUPAI_ADMIN_PASSWORD_HASH?: string;
    ZAKUPAI_ADMIN_NAME?: string;
    ZAKUPAI_PUBLIC_URL?: string;
    SMTP_RELAY_URL?: string;
    SMTP_RELAY_TOKEN?: string;
  }
}

interface ImportMetaEnv {
  readonly VITE_ZAKUPAI_LOCAL_PREVIEW?: string;
}
