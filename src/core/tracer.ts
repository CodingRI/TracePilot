import { performance } from "node:perf_hooks";
import { ConsoleExporter } from "../exporters/console.js";
import type { Trace, TraceExporter, TraceOptions, TracerOptions } from "../types/trace.js";
import { TraceRun } from "./run.js";
import { generateId, serializeError } from "./span.js";

export type TraceCallback<T> = (run: TraceRun) => T | Promise<T>;

export class Tracer {
  private readonly exporter?: TraceExporter;
  private readonly defaultMetadata: Record<string, unknown>;

  constructor(options: TracerOptions = {}) {
    if (options.exporter === null) {
      this.exporter = undefined;
    } else if (options.exporter !== undefined) {
      this.exporter = options.exporter;
    } else {
      this.exporter = new ConsoleExporter();
    }
    this.defaultMetadata = { ...(options.defaultMetadata ?? {}) };
  }

  trace<T>(name: string, callback: TraceCallback<T>): Promise<T>;
  trace<T>(name: string, options: TraceOptions, callback: TraceCallback<T>): Promise<T>;
  async trace<T>(
    name: string,
    optionsOrCallback: TraceOptions | TraceCallback<T>,
    maybeCallback?: TraceCallback<T>
  ): Promise<T> {
    let options: TraceOptions = {};
    let callback: TraceCallback<T>;

    if (typeof optionsOrCallback === "function") {
      callback = optionsOrCallback;
    } else {
      options = optionsOrCallback ?? {};
      if (typeof maybeCallback !== "function") {
        throw new TypeError("TracePilot: A callback function is required for tracer.trace()");
      }
      callback = maybeCallback;
    }

    const trace: Trace = {
      id: generateId(),
      name,
      startTime: Date.now(),
      status: "running",
      spans: [],
      metadata: { ...this.defaultMetadata, ...(options.metadata ?? {}) },
    };

    const run = new TraceRun(trace);
    const startPerf = performance.now();

    try {
      const result = await callback(run);
      trace.status = "success";
      return result;
    } catch (error) {
      trace.status = "error";
      trace.error = serializeError(error);
      throw error;
    } finally {
      const endPerf = performance.now();
      trace.endTime = Date.now();
      trace.duration = Math.max(0, Math.round((endPerf - startPerf) * 100) / 100);

      if (this.exporter) {
        try {
          await this.exporter.export(trace);
        } catch (exportErr) {
          console.error("TracePilot: Exporter encountered an error:", exportErr);
        }
      }
    }
  }
}

export function createTracer(options?: TracerOptions): Tracer {
  return new Tracer(options);
}
