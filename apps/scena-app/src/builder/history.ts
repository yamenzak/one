/**
 * Undo/redo for the widget builder. A minimal past/present/future stack over the
 * node array. Discrete edits call `commit` (push a checkpoint); continuous
 * gestures (drag/resize) call `checkpoint()` once at gesture start, then `live()`
 * per frame (which mutates the present without touching the stack), so one undo
 * reverses the whole gesture — not every intermediate frame.
 */
import { useCallback, useReducer, useRef, useState } from "react";

export interface History<T> {
  present: T;
  /** A discrete edit: snapshot the current present, then apply `next`. */
  commit: (next: T | ((prev: T) => T)) => void;
  /** A live, uncommitted update (mid-gesture): change present only. */
  live: (next: T | ((prev: T) => T)) => void;
  /** Snapshot the current present onto the undo stack (call at gesture start). */
  checkpoint: () => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  /** Replace everything and clear history (e.g. on load). */
  reset: (v: T) => void;
}

const LIMIT = 100;

export function useHistory<T>(initial: T): History<T> {
  const [present, setPresent] = useState<T>(initial);
  const presentRef = useRef(present);
  presentRef.current = present;
  const past = useRef<T[]>([]);
  const future = useRef<T[]>([]);
  const [, force] = useReducer((x: number) => x + 1, 0);

  const set = useCallback((next: T | ((prev: T) => T)) => {
    setPresent((prev) => (typeof next === "function" ? (next as (p: T) => T)(prev) : next));
  }, []);

  const commit = useCallback((next: T | ((prev: T) => T)) => {
    past.current.push(presentRef.current);
    if (past.current.length > LIMIT) past.current.shift();
    future.current = [];
    set(next);
    force();
  }, [set]);

  const checkpoint = useCallback(() => {
    past.current.push(presentRef.current);
    if (past.current.length > LIMIT) past.current.shift();
    future.current = [];
    force();
  }, []);

  const undo = useCallback(() => {
    if (!past.current.length) return;
    future.current.push(presentRef.current);
    setPresent(past.current.pop()!);
    force();
  }, []);

  const redo = useCallback(() => {
    if (!future.current.length) return;
    past.current.push(presentRef.current);
    setPresent(future.current.pop()!);
    force();
  }, []);

  const reset = useCallback((v: T) => {
    past.current = [];
    future.current = [];
    setPresent(v);
    force();
  }, []);

  return { present, commit, live: set, checkpoint, undo, redo, canUndo: past.current.length > 0, canRedo: future.current.length > 0, reset };
}
