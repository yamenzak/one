import { describe, it, expect } from "vitest";
import {
  encode,
  decodeClient,
  decodeServer,
  PROTOCOL_VERSION,
  type ClientMessage,
  type ServerMessage,
} from "../src/index.js";

describe("client messages", () => {
  it("round-trips a sync ping", () => {
    const msg: ClientMessage = { type: "sync.ping", tSend: 12345 };
    expect(decodeClient(encode(msg))).toEqual(msg);
  });

  it("round-trips a hello", () => {
    const msg: ClientMessage = { type: "hello", protocol: PROTOCOL_VERSION };
    expect(decodeClient(encode(msg))).toEqual(msg);
  });

  it("rejects an unknown client type", () => {
    expect(() => decodeClient('{"type":"nope"}')).toThrow();
  });

  it("rejects a wrong protocol version", () => {
    expect(() => decodeClient('{"type":"hello","protocol":999}')).toThrow();
  });
});

describe("server messages", () => {
  it("round-trips a pairing message", () => {
    const msg: ServerMessage = { type: "pairing", state: "pairing", code: "R7X2" };
    expect(decodeServer(encode(msg))).toEqual(msg);
  });

  it("round-trips a sync pong", () => {
    const msg: ServerMessage = { type: "sync.pong", tSend: 1, tServer: 2 };
    expect(decodeServer(encode(msg))).toEqual(msg);
  });

  it("round-trips a manifest nudge", () => {
    const msg: ServerMessage = {
      type: "manifest",
      channelId: "ch1",
      version: 3,
      hash: "abc",
      url: "https://r2/ch1/3.json",
    };
    expect(decodeServer(encode(msg))).toEqual(msg);
  });

  it("applies the interrupt priority default", () => {
    const decoded = decodeServer(
      '{"type":"interrupt","id":"i1","role":"emergency","startEpoch":10,"durationMs":5000}',
    );
    if (decoded.type === "interrupt") expect(decoded.priority).toBe(0);
  });

  it("round-trips an emergency override + all-clear", () => {
    const emg: ServerMessage = { type: "emergency", id: "emg_1", title: "Building closed", body: "Please exit", tone: "alarm", epoch: 42 };
    expect(decodeServer(encode(emg))).toEqual(emg);
    const clear: ServerMessage = { type: "clear", id: "emg_1" };
    expect(decodeServer(encode(clear))).toEqual(clear);
  });

  it("round-trips a non-alarm takeover tone", () => {
    const notice: ServerMessage = { type: "emergency", id: "n1", title: "We're closed", body: "See you tomorrow", tone: "neutral", epoch: 7 };
    expect(decodeServer(encode(notice))).toEqual(notice);
  });

  it("defaults an emergency tone + body", () => {
    const decoded = decodeServer('{"type":"emergency","id":"e","title":"Alert","epoch":1}');
    if (decoded.type === "emergency") { expect(decoded.body).toBe(""); expect(decoded.tone).toBe("alarm"); }
  });

  it("rejects malformed JSON", () => {
    expect(() => decodeServer("{not json")).toThrow();
  });
});
