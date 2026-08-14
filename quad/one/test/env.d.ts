declare module "cloudflare:test" {
  interface ProvidedEnv {
    DIRECTORY: D1Database;
    SHARD_EU_1: D1Database;
    ASSETS: { fetch(request: Request): Promise<Response> };
    ROOT: string;
    ENVIRONMENT: string;
    AUTH_SECRET: string;
  }
}
