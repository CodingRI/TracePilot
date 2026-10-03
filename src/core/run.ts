import { performance } from "node:perf_hooks";
import type { Span, SpanOptions, Trace } from "../types/trace.js";
import { ContextManager } from "./context.js";
import { SpanRecord } from "./span.js";

export type SpanCallback<T> = (span: SpanRecord) => T | Promise<T>;

export class TraceRun {
  readonly trace: Trace;
  private readonly contextManager: ContextManager;

  constructor(trace: Trace, contextManager?: ContextManager) {
    this.trace = trace;
    this.contextManager = contextManager ?? new ContextManager();
  }

  get id(): string {
    return this.trace.id;
  }

  get name(): string {
    return this.trace.name;
  }

  get spans(): Span[] {
    return this.trace.spans;
  }

  setMetadata(key: string, value: unknown): this {
    this.trace.metadata[key] = value;
    return this;
  }

  addMetadata(metadata: Record<string, unknown>): this {
    Object.assign(this.trace.metadata, metadata);
    return this;
  }

  span<T>(name: string, callback: SpanCallback<T>): Promise<T>;
  span<T>(name: string, options: SpanOptions, callback: SpanCallback<T>): Promise<T>;
  async span<T>(
    name: string,
    optionsOrCallback: SpanOptions | SpanCallback<T>,
    maybeCallback?: SpanCallback<T>
  ): Promise<T> {
    let options: SpanOptions = {};
    let callback: SpanCallback<T>;

    if (typeof optionsOrCallback === "function") {
      callback = optionsOrCallback;
    } else {
      options = optionsOrCallback ?? {};
      if (typeof maybeCallback !== "function") {
        throw new TypeError("TracePilot: A callback function is required for run.span()");
      }
      callback = maybeCallback;
    }

    const parentId = this.contextManager.getActiveSpanId();
    const spanRecord = new SpanRecord(name, options, parentId);

    this.trace.spans.push(spanRecord);

    const startPerf = performance.now();

    return this.contextManager.run(
      { traceId: this.trace.id, spanId: spanRecord.id },
      async () => {
        try {
          const result = await callback(spanRecord);
          spanRecord.end(startPerf, "success");
          return result;
        } catch (error) {
          spanRecord.end(startPerf, "error", error);
          throw error;
        }
      }
    );
  }
}
