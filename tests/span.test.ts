import { performance } from "node:perf_hooks";
import { describe, expect, it } from "vitest";
import { SpanRecord, generateId, serializeError } from "../src/core/span.js";
import { ConsoleExporter } from "../src/exporters/console.js";
import { JsonExporter } from "../src/exporters/json.js";
import type { Trace } from "../src/types/trace.js";

describe("SpanRecord and Utilities", () => {
  it("generates unique valid string IDs", () => {
    const id1 = generateId();
    const id2 = generateId();
    expect(id1).toBeTypeOf("string");
    expect(id2).toBeTypeOf("string");
    expect(id1.length).toBeGreaterThan(10);
    expect(id1).not.toBe(id2);
  });

  it("creates a SpanRecord with correct default values", () => {
    const span = new SpanRecord("test-span");
    expect(span.name).toBe("test-span");
    expect(span.type).toBe("custom");
    expect(span.status).toBe("running");
    expect(span.attributes).toEqual({});
    expect(span.parentId).toBeUndefined();
    expect(span.startTime).toBeLessThanOrEqual(Date.now());
    expect(span.endTime).toBeUndefined();
    expect(span.duration).toBeUndefined();
  });

  it("updates attributes via setAttribute and setAttributes", () => {
    const span = new SpanRecord("attribute-span", {
      attributes: { initial: true },
    });

    span.setAttribute("step", 1);
    span.setAttributes({ temperature: 0.2, topP: 0.95 });

    expect(span.attributes).toEqual({
      initial: true,
      step: 1,
      temperature: 0.2,
      topP: 0.95,
    });
  });

  it("measures high-resolution duration accurately", async () => {
    const span = new SpanRecord("timed-span");
    const startPerf = performance.now();

    await new Promise((resolve) => setTimeout(resolve, 25));

    span.end(startPerf, "success");

    expect(span.status).toBe("success");
    expect(span.endTime).toBeDefined();
    expect(span.duration).toBeGreaterThanOrEqual(20);
  });

  it("properly serializes various error types", () => {
    const standardError = new Error("Standard error message");
    const serializedStandard = serializeError(standardError);
    expect(serializedStandard.name).toBe("Error");
    expect(serializedStandard.message).toBe("Standard error message");
    expect(serializedStandard.stack).toBeDefined();

    const stringError = serializeError("Raw string thrown");
    expect(stringError.name).toBe("Error");
    expect(stringError.message).toBe("Raw string thrown");

    const objectError = serializeError({ code: 500, detail: "Server error" });
    expect(objectError.name).toBe("Error");
    expect(objectError.message).toContain("500");
  });
});

describe("JsonExporter", () => {
  it("stores, retrieves, and clears traces", () => {
    const exporter = new JsonExporter();
    expect(exporter.getTraces()).toHaveLength(0);
    expect(exporter.getLastTrace()).toBeUndefined();

    const mockTrace: Trace = {
      id: "trace-1",
      name: "agent-1",
      startTime: Date.now(),
      status: "success",
      spans: [],
      metadata: {},
    };

    exporter.export(mockTrace);
    expect(exporter.getTraces()).toHaveLength(1);
    expect(exporter.getLastTrace()?.id).toBe("trace-1");
    expect(exporter.getTraceById("trace-1")?.name).toBe("agent-1");
    expect(exporter.getTraceById("unknown")).toBeUndefined();

    const jsonString = exporter.toJson();
    expect(jsonString).toContain("agent-1");

    exporter.clear();
    expect(exporter.getTraces()).toHaveLength(0);
  });
});

describe("ConsoleExporter", () => {
  it("formats a readable trace matching the design specification", () => {
    const logs: string[] = [];
    const exporter = new ConsoleExporter({
      logger: (msg) => logs.push(msg),
    });

    const mockTrace: Trace = {
      id: "trace-console",
      name: "research-agent",
      startTime: 1000,
      endTime: 2110,
      duration: 1110,
      status: "success",
      metadata: {},
      spans: [
        {
          id: "span-1",
          name: "retrieval",
          type: "retrieval",
          startTime: 1000,
          endTime: 1120,
          duration: 120,
          status: "success",
          attributes: {},
        },
        {
          id: "span-2",
          name: "llm",
          type: "llm",
          startTime: 1120,
          endTime: 1960,
          duration: 840,
          status: "success",
          attributes: {},
        },
        {
          id: "span-3",
          name: "tool",
          type: "tool",
          startTime: 1960,
          endTime: 2110,
          duration: 150,
          status: "success",
          attributes: {},
        },
      ],
    };

    exporter.export(mockTrace);

    const output = logs.join("\n");
    expect(output).toContain("[TracePilot] research-agent");
    expect(output).toContain("retrieval");
    expect(output).toContain("120ms");
    expect(output).toContain("llm");
    expect(output).toContain("840ms");
    expect(output).toContain("tool");
    expect(output).toContain("150ms");
    expect(output).toContain("Total: 1.11s");
    expect(output).toContain("Status: success");
  });

  it("formats nested spans with hierarchy tree symbols", () => {
    const logs: string[] = [];
    const exporter = new ConsoleExporter({
      logger: (msg) => logs.push(msg),
    });

    const mockTrace: Trace = {
      id: "trace-nested",
      name: "complex-agent",
      startTime: 1000,
      endTime: 1500,
      duration: 500,
      status: "success",
      metadata: {},
      spans: [
        {
          id: "root-1",
          name: "agent-step",
          type: "agent",
          startTime: 1000,
          endTime: 1500,
          duration: 500,
          status: "success",
          attributes: {},
        },
        {
          id: "child-1",
          parentId: "root-1",
          name: "retrieval",
          type: "retrieval",
          startTime: 1000,
          endTime: 1100,
          duration: 100,
          status: "success",
          attributes: {},
        },
      ],
    };

    exporter.export(mockTrace);
    const output = logs.join("\n");

    expect(output).toContain("agent-step");
    expect(output).toContain("retrieval");
    expect(output).toContain("Total: 500ms");
  });

  it("formats error traces and error spans with details", () => {
    const logs: string[] = [];
    const exporter = new ConsoleExporter({
      logger: (msg) => logs.push(msg),
    });

    const mockTrace: Trace = {
      id: "trace-err",
      name: "failing-agent",
      startTime: 1000,
      endTime: 1200,
      duration: 200,
      status: "error",
      metadata: {},
      error: {
        name: "TimeoutError",
        message: "Network call timed out",
      },
      spans: [
        {
          id: "s-err",
          name: "fetch-docs",
          type: "retrieval",
          startTime: 1000,
          endTime: 1200,
          duration: 200,
          status: "error",
          attributes: {},
          error: {
            name: "TimeoutError",
            message: "Network call timed out",
          },
        },
      ],
    };

    exporter.export(mockTrace);
    const output = logs.join("\n");

    expect(output).toContain("✗");
    expect(output).toContain("TimeoutError: Network call timed out");
    expect(output).toContain("Status: error (TimeoutError: Network call timed out)");
  });

  it("handles traces with zero spans cleanly", () => {
    const logs: string[] = [];
    const exporter = new ConsoleExporter({
      logger: (msg) => logs.push(msg),
    });

    const emptyTrace: Trace = {
      id: "empty",
      name: "empty-agent",
      startTime: 100,
      endTime: 110,
      duration: 10,
      status: "success",
      metadata: {},
      spans: [],
    };

    exporter.export(emptyTrace);
    const output = logs.join("\n");
    expect(output).toContain("(no spans recorded)");
  });
});
