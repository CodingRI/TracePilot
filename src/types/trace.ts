export type TraceStatus = "running" | "success" | "error";
export type SpanStatus = "running" | "success" | "error";

export type SpanType = "llm" | "tool" | "retrieval" | "agent" | "custom";

export interface TraceError {
  name: string;
  message: string;
  stack?: string;
}

export type SpanError = TraceError;

export interface Span {
  id: string;
  parentId?: string;
  name: string;
  type: SpanType;
  startTime: number;
  endTime?: number;
  duration?: number;
  status: SpanStatus;
  attributes: Record<string, unknown>;
  error?: SpanError;
}

export interface Trace {
  id: string;
  name: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  status: TraceStatus;
  spans: Span[];
  metadata: Record<string, unknown>;
  error?: TraceError;
}

export interface SpanOptions {
  type?: SpanType;
  attributes?: Record<string, unknown>;
}

export interface TraceOptions {
  metadata?: Record<string, unknown>;
}

export interface TraceExporter {
  export(trace: Trace): Promise<void> | void;
}

export interface ConsoleExporterOptions {
  logger?: (message: string) => void;
  colors?: boolean;
  animate?: boolean;
  animationDelayMs?: number;
  width?: number;
}

export interface TracerOptions {
  exporter?: TraceExporter | null;
  defaultMetadata?: Record<string, unknown>;
  consoleExporterOptions?: ConsoleExporterOptions;
}

export type TraceCallback<T, R = any> = (run: R) => T | Promise<T>;
export type SpanCallback<T, S = any> = (span: S) => T | Promise<T>;
