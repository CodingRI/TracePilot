import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import type { Span, SpanError, SpanOptions, SpanStatus, SpanType } from "../types/trace.js";

export function generateId(): string {
  return randomUUID();
}

export function serializeError(err: unknown): SpanError {
  if (err instanceof Error) {
    return {
      name: err.name || "Error",
      message: err.message || String(err),
      stack: err.stack,
    };
  }

  return {
    name: "Error",
    message: typeof err === "string" ? err : JSON.stringify(err),
  };
}

export class SpanRecord implements Span {
  readonly id: string;
  readonly parentId?: string;
  readonly name: string;
  readonly type: SpanType;
  readonly startTime: number;
  endTime?: number;
  duration?: number;
  status: SpanStatus;
  attributes: Record<string, unknown>;
  error?: SpanError;

  constructor(
    name: string,
    options: SpanOptions = {},
    parentId?: string,
    id?: string
  ) {
    this.id = id ?? generateId();
    this.parentId = parentId;
    this.name = name;
    this.type = options.type ?? "custom";
    this.startTime = Date.now();
    this.status = "running";
    this.attributes = { ...(options.attributes ?? {}) };
  }

  setAttribute(key: string, value: unknown): this {
    this.attributes[key] = value;
    return this;
  }

  setAttributes(attrs: Record<string, unknown>): this {
    Object.assign(this.attributes, attrs);
    return this;
  }

  end(startPerf: number, status: SpanStatus = "success", error?: unknown): void {
    const endPerf = performance.now();
    this.endTime = Date.now();
    this.duration = Math.max(0, Math.round((endPerf - startPerf) * 100) / 100);
    this.status = status;
    if (error !== undefined) {
      this.error = serializeError(error);
    }
  }
}
