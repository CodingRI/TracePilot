import type { ConsoleExporterOptions, Span, Trace, TraceExporter } from "../types/trace.js";
import { createTheme, type Theme } from "../utils/theme.js";

export type { ConsoleExporterOptions };

interface SpanTreeNode {
  span: Span;
  children: SpanTreeNode[];
}

export class ConsoleExporter implements TraceExporter {
  private readonly logger: (message: string) => void;
  private readonly hasCustomLogger: boolean;
  private readonly theme: Theme;
  private readonly animate?: boolean;
  private readonly animationDelayMs: number;
  private readonly customWidth?: number;

  constructor(options: ConsoleExporterOptions = {}) {
    this.hasCustomLogger = Boolean(options.logger);
    this.logger = options.logger ?? console.log;
    this.theme = createTheme(options.colors);
    this.animate = options.animate;
    this.animationDelayMs = options.animationDelayMs ?? 12;
    this.customWidth = options.width;
  }

  async export(trace: Trace): Promise<void> {
    const formatted = this.formatTrace(trace);

    if (this.shouldAnimate()) {
      await this.animateReveal(formatted);
    } else {
      this.logger(formatted);
    }
  }

  private shouldAnimate(): boolean {
    if (this.animate !== undefined) {
      return this.animate;
    }
    if (this.hasCustomLogger) {
      return false;
    }
    if (typeof process === "undefined") {
      return false;
    }
    if (
      process.env?.NODE_ENV === "test" ||
      process.env?.VITEST === "true" ||
      Boolean(process.env?.CI)
    ) {
      return false;
    }
    return Boolean(process.stdout?.isTTY);
  }

  private async animateReveal(formatted: string): Promise<void> {
    const lines = formatted.split("\n");
    for (let i = 0; i < lines.length; i++) {
      this.logger(lines[i]);
      if (i < lines.length - 1 && this.animationDelayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, this.animationDelayMs));
      }
    }
  }

  formatTrace(trace: Trace): string {
    const t = this.theme;
    const tree = this.buildSpanTree(trace.spans);
    const maxColumnWidth = this.calculateMaxColumnWidth(tree);

    // Calculate divider width: accommodates header, tree entries, and terminal limits
    const terminalWidth =
      typeof process !== "undefined" && process.stdout?.columns
        ? Math.min(process.stdout.columns - 2, 78)
        : 70;
    const calculatedWidth = Math.max(
      terminalWidth,
      maxColumnWidth + 24,
      `[TracePilot] ${trace.name}`.length + 12
    );
    const dividerWidth = this.customWidth ?? Math.min(Math.max(calculatedWidth, 64), 84);

    const lines: string[] = [];

    // Breathing room above
    lines.push("");

    // Top Divider & Header Banner
    const headerPrefix = `[TracePilot] ${trace.name}`;
    const topBarLength = Math.max(4, dividerWidth - (headerPrefix.length + 7));
    const topDivider =
      t.divider("╭── ") +
      t.bold(t.amber("[TracePilot]")) +
      " " +
      t.bold(trace.name) +
      " " +
      t.divider("─".repeat(topBarLength));
    lines.push(topDivider);

    // Span Tree or Empty State
    if (trace.spans.length === 0) {
      lines.push(`${t.divider("│")}  ${t.warmMuted("(no spans recorded)")}`);
    } else {
      this.renderTree(tree, "", maxColumnWidth, lines);
    }

    // Mid Divider before Summary
    const midDivider = t.divider("├" + "─".repeat(dividerWidth - 1));
    lines.push(midDivider);

    // Summary Line with Status, Total Duration, and Span count
    const formattedDuration = this.formatDuration(trace.duration ?? 0);
    let statusText: string;
    if (trace.status === "error" && trace.error) {
      statusText = `error (${trace.error.name}: ${trace.error.message})`;
    } else {
      statusText = trace.status;
    }

    const coloredStatus =
      trace.status === "success"
        ? t.warmGreen(statusText)
        : trace.status === "error"
          ? t.warmRed(statusText)
          : t.amber(statusText);

    // Aggregate total tokens, total cost, and failures
    let totalTokens = typeof trace.metadata?.totalTokens === "number" ? trace.metadata.totalTokens : 0;
    let totalCost = typeof trace.metadata?.totalCost === "number" ? trace.metadata.totalCost : 0;
    let failuresCount = 0;

    for (const span of trace.spans) {
      if (span.status === "error") failuresCount++;
      const attrs = span.attributes || {};
      const spanTokens = (attrs.totalTokens as number) ?? 
        ((typeof attrs.promptTokens === "number" ? attrs.promptTokens : 0) + 
         (typeof attrs.completionTokens === "number" ? attrs.completionTokens : 0));
      if (typeof spanTokens === "number" && spanTokens > 0 && typeof trace.metadata?.totalTokens !== "number") {
        totalTokens += spanTokens;
      }
      const spanCost = (attrs.cost as number) ?? (attrs.creditCost as number);
      if (typeof spanCost === "number" && spanCost > 0 && typeof trace.metadata?.totalCost !== "number") {
        totalCost += spanCost;
      }
    }

    const summaryParts: string[] = [
      `${t.divider("│")}  Status: ${coloredStatus}`,
      `Total: ${t.warmGold(formattedDuration)}`,
    ];

    if (totalTokens > 0) {
      const tokensFormatted = totalTokens >= 1000 ? `${(totalTokens / 1000).toFixed(1)}k` : `${totalTokens}`;
      summaryParts.push(`Tokens: ${t.warmGold(tokensFormatted)}`);
    }

    if (totalCost > 0) {
      summaryParts.push(`Cost: ${t.warmGold(`${totalCost.toFixed(5)}`)}`);
    }

    let spansText = `${trace.spans.length} recorded`;
    if (failuresCount > 0) {
      spansText += ` (${t.warmRed(`${failuresCount} failed`)})`;
    }
    summaryParts.push(`Spans: ${t.warmMuted(spansText)}`);

    const summaryLine = summaryParts.join(`   ${t.warmMuted("•")}   `);
    lines.push(summaryLine);

    // Bottom Divider
    const bottomDivider = t.divider("╰" + "─".repeat(dividerWidth - 1));
    lines.push(bottomDivider);

    // Breathing room below
    lines.push("");

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

  private calculateMaxColumnWidth(nodes: SpanTreeNode[], depth = 0): number {
    let max = 0;
    for (const node of nodes) {
      const branchWidth = depth * 3 + 3; // depth indentation + branch chars
      const itemWidth = branchWidth + node.span.name.length;
      if (itemWidth > max) {
        max = itemWidth;
      }
      if (node.children.length > 0) {
        const childMax = this.calculateMaxColumnWidth(node.children, depth + 1);
        if (childMax > max) {
          max = childMax;
        }
      }
    }
    return Math.max(max, 32);
  }

  private renderTree(
    nodes: SpanTreeNode[],
    prefix: string,
    targetWidth: number,
    lines: string[]
  ): void {
    const t = this.theme;

    nodes.forEach((node, index) => {
      const isLast = index === nodes.length - 1;
      const branchSymbol = isLast ? "└─ " : "├─ ";
      const childPrefix = prefix + (isLast ? "   " : "│  ");

      const span = node.span;
      const durationStr = this.formatDuration(span.duration ?? 0);
      const statusIcon =
        span.status === "success"
          ? t.warmGreen("✓")
          : span.status === "error"
            ? t.warmRed("✗")
            : t.amber("…");

      const visualBranch = `${prefix}${branchSymbol}`;
      const visualEntry = `${visualBranch}${span.name}`;
      const paddingLength = Math.max(1, targetWidth - visualEntry.length);

      const treeBranchColored = t.warmMuted(visualBranch);
      const spanNameColored = t.bold(span.name);
      const paddedSpace = " ".repeat(paddingLength);
      const durationColored = t.warmGold(durationStr.padStart(8));

      let line = `${t.divider("│")}  ${treeBranchColored}${spanNameColored}${paddedSpace} ${durationColored} ${statusIcon}${this.formatSpanBadge(span)}`;

      if (span.status === "error" && span.error) {
        line += ` ${t.warmRed(`(${span.error.name}: ${span.error.message})`)}`;
      }

      lines.push(line);

      if (node.children.length > 0) {
        this.renderTree(node.children, childPrefix, targetWidth, lines);
      }
    });
  }

  private formatSpanBadge(span: Span): string {
    const t = this.theme;
    const parts: string[] = [];
    const attrs = span.attributes || {};

    const model = (attrs.model as string) || (attrs.modelName as string);
    if (model) {
      parts.push(model);
    }

    const totalTokens = (attrs.totalTokens as number) ?? (attrs.tokens as number);
    const promptTokens = attrs.promptTokens as number;
    const completionTokens = attrs.completionTokens as number;

    if (typeof totalTokens === "number" && totalTokens > 0) {
      const tokStr = totalTokens >= 1000 ? `${(totalTokens / 1000).toFixed(1)}k tok` : `${totalTokens} tok`;
      parts.push(tokStr);
    } else if (typeof promptTokens === "number" || typeof completionTokens === "number") {
      const tot = (promptTokens ?? 0) + (completionTokens ?? 0);
      if (tot > 0) {
        const tokStr = tot >= 1000 ? `${(tot / 1000).toFixed(1)}k tok` : `${tot} tok`;
        parts.push(tokStr);
      }
    }

    const reasoningTokens = (attrs.reasoningTokens as number) ?? (attrs.reasoning_tokens as number);
    if (typeof reasoningTokens === "number" && reasoningTokens > 0) {
      const rStr = reasoningTokens >= 1000 ? `${(reasoningTokens / 1000).toFixed(1)}k r-tok` : `${reasoningTokens} r-tok`;
      parts.push(rStr);
    }

    const cost = (attrs.cost as number) ?? (attrs.creditCost as number);
    if (typeof cost === "number" && cost > 0) {
      parts.push(`${cost.toFixed(5)}`);
    }

    if (parts.length === 0) return "";
    return "  " + t.warmMuted(`[${parts.join(" • ")}]`);
  }

  private formatDuration(ms: number): string {
    if (ms >= 1000) {
      return `${(ms / 1000).toFixed(2)}s`;
    }
    return `${Math.round(ms)}ms`;
  }
}
