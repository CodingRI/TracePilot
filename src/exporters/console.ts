import type { Span, Trace, TraceExporter } from "../types/trace.js";

export interface ConsoleExporterOptions {
  logger?: (message: string) => void;
}

interface SpanTreeNode {
  span: Span;
  children: SpanTreeNode[];
}

export class ConsoleExporter implements TraceExporter {
  private readonly logger: (message: string) => void;

  constructor(options: ConsoleExporterOptions = {}) {
    this.logger = options.logger ?? console.log;
  }

  export(trace: Trace): void {
    const formatted = this.formatTrace(trace);
    this.logger(formatted);
  }

  formatTrace(trace: Trace): string {
    const lines: string[] = [];
    lines.push(`[TracePilot] ${trace.name}`);

    if (trace.spans.length === 0) {
      lines.push("  (no spans recorded)");
    } else {
      const tree = this.buildSpanTree(trace.spans);
      this.renderTree(tree, "", lines);
    }

    const formattedDuration = this.formatDuration(trace.duration ?? 0);
    lines.push("");
    lines.push(`Total: ${formattedDuration}`);

    let statusLine = `Status: ${trace.status}`;
    if (trace.status === "error" && trace.error) {
      statusLine += ` (${trace.error.name}: ${trace.error.message})`;
    }
    lines.push(statusLine);

    return lines.join("\n");
  }

  private buildSpanTree(spans: Span[]): SpanTreeNode[] {
    const spanMap = new Map<string, SpanTreeNode>();
    const roots: SpanTreeNode[] = [];

    for (const span of spans) {
      spanMap.set(span.id, { span, children: [] });
    }

    for (const span of spans) {
      const node = spanMap.get(span.id)!;
      if (span.parentId && spanMap.has(span.parentId)) {
        spanMap.get(span.parentId)!.children.push(node);
      } else {
        roots.push(node);
      }
    }

    return roots;
  }

  private renderTree(nodes: SpanTreeNode[], prefix: string, lines: string[]): void {
    nodes.forEach((node, index) => {
      const isLast = index === nodes.length - 1;
      const branch = isLast ? "└─ " : "├─ ";
      const childPrefix = prefix + (isLast ? "   " : "│  ");

      const span = node.span;
      const durationStr = this.formatDuration(span.duration ?? 0);
      const statusIcon = span.status === "success" ? "✓" : span.status === "error" ? "✗" : "…";

      const targetWidth = Math.max(16, 24 - prefix.length);
      const namePadded = span.name.padEnd(targetWidth);

      let line = `${prefix}${branch}${namePadded} ${durationStr.padStart(8)} ${statusIcon}`;
      if (span.status === "error" && span.error) {
        line += ` (${span.error.name}: ${span.error.message})`;
      }
      lines.push(line);

      if (node.children.length > 0) {
        this.renderTree(node.children, childPrefix, lines);
      }
    });
  }

  private formatDuration(ms: number): string {
    if (ms >= 1000) {
      return `${(ms / 1000).toFixed(2)}s`;
    }
    return `${Math.round(ms)}ms`;
  }
}
