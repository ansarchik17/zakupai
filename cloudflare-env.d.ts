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
    SMTP_HOST?: string;
    SMTP_PORT?: string;
    SMTP_USERNAME?: string;
    SMTP_USER?: string;
    SMTP_PASSWORD?: string;
    SMTP_FROM_EMAIL?: string;
    SMTP_FROM_NAME?: string;
    SMTP_USE_TLS?: string;
    SMTP_IMPLICIT_TLS?: string;
    SMTP_SKIP_TLS_VERIFY?: string;
    EMAIL_CODE_SECRET?: string;
  }
}

interface ImportMetaEnv {
  readonly VITE_ZAKUPAI_LOCAL_PREVIEW?: string;
}
