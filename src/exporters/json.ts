import type { Trace, TraceExporter } from "../types/trace.js";

export class JsonExporter implements TraceExporter {
  private traces: Trace[] = [];

  export(trace: Trace): void {
    this.traces.push(structuredClone(trace));
  }

  getTraces(): Trace[] {
    return structuredClone(this.traces);
  }

  getLastTrace(): Trace | undefined {
    const last = this.traces[this.traces.length - 1];
    return last ? structuredClone(last) : undefined;
  }

  getTraceById(id: string): Trace | undefined {
    const found = this.traces.find((t) => t.id === id);
    return found ? structuredClone(found) : undefined;
  }

  toJson(pretty = false): string {
    return JSON.stringify(this.traces, null, pretty ? 2 : undefined);
  }

  clear(): void {
    this.traces = [];
  }
}
