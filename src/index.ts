export { createTracer, Tracer, type TraceCallback } from "./core/tracer.js";
export { TraceRun, type SpanCallback } from "./core/run.js";
export { SpanRecord, generateId, serializeError } from "./core/span.js";
export { ContextManager, type SpanContext } from "./core/context.js";

export { ConsoleExporter, type ConsoleExporterOptions } from "./exporters/console.js";
export { JsonExporter } from "./exporters/json.js";

export type {
  Trace,
  Span,
  TraceStatus,
  SpanStatus,
  SpanType,
  TraceError,
  SpanError,
  SpanOptions,
  TraceOptions,
  TraceExporter,
  TracerOptions,
} from "./types/trace.js";
