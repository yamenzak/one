/**
 * A stand-in for the runtime validator.
 *
 * Stage 0 is about SHAPE, and binding zod now would mean choosing a validator
 * before knowing what the surface layer asks of one. `Schema<T>` carries the
 * type and nothing else; stage 2 replaces this with the real thing and every
 * call site below is unchanged.
 */
import type { Schema } from "../src/operation.js";
export const z = <T>(): Schema<T> => ({});
