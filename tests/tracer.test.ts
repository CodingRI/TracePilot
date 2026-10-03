import { describe, expect, it, vi } from "vitest";
import { createTracer, Tracer } from "../src/core/tracer.js";
import { JsonExporter } from "../src/exporters/json.js";
import type { TraceExporter } from "../src/types/trace.js";


describe("Tracer", () => {
  it("creates a tracer instance with default options", () => {
    const tracer = createTracer();
    expect(tracer).toBeInstanceOf(Tracer);
  });

  it("creates a tracer with custom JsonExporter", () => {
    const exporter = new JsonExporter();
    const tracer = createTracer({ exporter });
    expect(tracer).toBeInstanceOf(Tracer);
  });

  it("creates a tracer with exporting disabled (exporter: null)", async () => {
    const tracer = createTracer({ exporter: null });
    const result = await tracer.trace("silent-trace", async (run) => {
      return run.id;
    });
    expect(typeof result).toBe("string");
  });

  it("applies defaultMetadata to every trace", async () => {
    const exporter = new JsonExporter();
    const tracer = createTracer({
      exporter,
      defaultMetadata: { environment: "test", service: "agent-service" },
    });

    await tracer.trace("metadata-trace", async () => {
      return "done";
    });

    const trace = exporter.getLastTrace();
    expect(trace).toBeDefined();
    expect(trace?.metadata).toMatchObject({
      environment: "test",
      service: "agent-service",
    });
  });

  it("starts and completes a successful trace", async () => {
    const exporter = new JsonExporter();
    const tracer = createTracer({ exporter });

    const beforeTime = Date.now();
    const result = await tracer.trace("test-agent", async (run) => {
      expect(run.id).toBeDefined();
      expect(run.name).toBe("test-agent");
      expect(run.trace.status).toBe("running");
      return { output: "answer-42" };
    });
    const afterTime = Date.now();

    expect(result).toEqual({ output: "answer-42" });

    const trace = exporter.getLastTrace();
    expect(trace).toBeDefined();
    expect(trace?.name).toBe("test-agent");
    expect(trace?.status).toBe("success");
    expect(trace?.startTime).toBeGreaterThanOrEqual(beforeTime);
    expect(trace?.endTime).toBeLessThanOrEqual(afterTime + 50);
    expect(trace?.duration).toBeGreaterThanOrEqual(0);
    expect(trace?.error).toBeUndefined();
  });

  it("marks trace as error and captures error details when callback throws", async () => {
    const exporter = new JsonExporter();
    const tracer = createTracer({ exporter });

    const customError = new Error("Agent failed during reasoning");

    await expect(
      tracer.trace("failing-agent", async () => {
        throw customError;
      })
    ).rejects.toThrow("Agent failed during reasoning");

    const trace = exporter.getLastTrace();
    expect(trace).toBeDefined();
    expect(trace?.name).toBe("failing-agent");
    expect(trace?.status).toBe("error");
    expect(trace?.error).toBeDefined();
    expect(trace?.error?.name).toBe("Error");
    expect(trace?.error?.message).toBe("Agent failed during reasoning");
    expect(trace?.error?.stack).toBeDefined();
    expect(trace?.duration).toBeGreaterThanOrEqual(0);
    expect(trace?.endTime).toBeDefined();
  });

  it("re-throws the exact original error", async () => {
    const tracer = createTracer({ exporter: null });
    class CustomAgentException extends Error {
      code = "AGENT_TIMEOUT";
    }

    const testError = new CustomAgentException("Timeout occurred");

    try {
      await tracer.trace("error-rethrow", async () => {
        throw testError;
      });
      expect.unreachable("Trace should have thrown");
    } catch (err) {
      expect(err).toBe(testError);
      expect((err as CustomAgentException).code).toBe("AGENT_TIMEOUT");
    }
  });

  it("preserves return values of different types", async () => {
    const tracer = createTracer({ exporter: null });

    const stringRes = await tracer.trace("t1", async () => "result string");
    expect(stringRes).toBe("result string");

    const numberRes = await tracer.trace("t2", async () => 12345);
    expect(numberRes).toBe(12345);

    const objectRes = await tracer.trace("t3", async () => ({ key: "value", arr: [1, 2] }));
    expect(objectRes).toEqual({ key: "value", arr: [1, 2] });

    const nullRes = await tracer.trace("t4", async () => null);
    expect(nullRes).toBeNull();
  });

  it("invokes the exporter with the finished trace", async () => {
    const mockExporter: TraceExporter = {
      export: vi.fn(),
    };

    const tracer = createTracer({ exporter: mockExporter });

    await tracer.trace("export-test", async (run) => {
      run.setMetadata("version", "1.0.0");
    });

    expect(mockExporter.export).toHaveBeenCalledTimes(1);
    const exportedTrace = vi.mocked(mockExporter.export).mock.calls[0][0];
    expect(exportedTrace.name).toBe("export-test");
    expect(exportedTrace.status).toBe("success");
    expect(exportedTrace.metadata.version).toBe("1.0.0");
  });

  it("invokes async exporter properly and awaits export", async () => {
    let exported = false;
    const asyncExporter: TraceExporter = {
      export: async () => {
        await new Promise((res) => setTimeout(res, 10));
        exported = true;
      },
    };

    const tracer = createTracer({ exporter: asyncExporter });
    await tracer.trace("async-export-test", async () => "ok");

    expect(exported).toBe(true);
  });

  it("does not break trace execution if exporter throws an error", async () => {
    const failingExporter: TraceExporter = {
      export: () => {
        throw new Error("Exporter network failure");
      },
    };

    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const tracer = createTracer({ exporter: failingExporter });

    const result = await tracer.trace("resilient-trace", async () => {
      return "success-despite-exporter-failure";
    });

    expect(result).toBe("success-despite-exporter-failure");
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it("supports custom options with metadata in tracer.trace()", async () => {
    const exporter = new JsonExporter();
    const tracer = createTracer({ exporter });

    await tracer.trace(
      "custom-options-trace",
      { metadata: { traceLevel: "verbose", runId: 99 } },
      async () => "done"
    );

    const trace = exporter.getLastTrace();
    expect(trace?.metadata.traceLevel).toBe("verbose");
    expect(trace?.metadata.runId).toBe(99);
  });
});
