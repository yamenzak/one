/**
 * Where a generated image goes.
 *
 * `@4dl/ai` needs to store what it generates, and `@4dl/storage` knows how — but
 * the QUOTA that governs the write lives in a billing table, and the app binds
 * that (see `@4dl/storage`'s README). So the AI package takes the two functions
 * it needs rather than depending on storage directly, and the app supplies its
 * already-bound versions.
 *
 * Without this the dependency would be `ai → storage → billing`, which is how a
 * package that only reads labels ends up requiring a payment provider.
 */

export interface MediaWriter {
  putMedia: (env: never, input: never) => Promise<{ key: string; sizeBytes: number }>;
  storageUsage: (env: never, tenantId: string) => Promise<{ usedBytes: number; limitBytes: number }>;
}

let writer: MediaWriter | null = null;

export function configureAiMedia(next: MediaWriter): void {
  writer = next;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export const putMedia = (env: any, input: any): Promise<{ key: string; sizeBytes: number }> => {
  if (!writer) throw new Error("configureAiMedia() was never called — image generation has nowhere to write");
  return (writer.putMedia as any)(env, input);
};

export const storageUsage = (env: any, tenantId: string): Promise<{ usedBytes: number; limitBytes: number }> => {
  // No writer configured ⇒ report unlimited rather than blocking: an app that
  // generates no images never configures one, and must not be told it is full.
  if (!writer) return Promise.resolve({ usedBytes: 0, limitBytes: -1 });
  return (writer.storageUsage as any)(env, tenantId);
};
