import { describe, expect, it } from "vitest";
import { createTracer } from "../src/core/tracer.js";
import { JsonExporter } from "../src/exporters/json.js";

describe("TraceRun and Spans", () => {
  it("creates and attaches a span to the trace", async () => {
    const exporter = new JsonExporter();
    const tracer = createTracer({ exporter });

    await tracer.trace("test-run", async (run) => {
      const spanResult = await run.span("fetch-data", async (span) => {
        expect(span.name).toBe("fetch-data");
        expect(span.status).toBe("running");
        expect(span.type).toBe("custom");
        return "data-123";
      });

      expect(spanResult).toBe("data-123");
      expect(run.spans.length).toBe(1);
    });

    const trace = exporter.getLastTrace();
    expect(trace?.spans.length).toBe(1);

    const span = trace!.spans[0];
    expect(span.name).toBe("fetch-data");
    expect(span.type).toBe("custom");
    expect(span.status).toBe("success");
    expect(span.duration).toBeGreaterThanOrEqual(0);
    expect(span.parentId).toBeUndefined();
  });

  it("supports span options: explicit type and custom attributes", async () => {
    const exporter = new JsonExporter();
    const tracer = createTracer({ exporter });

    await tracer.trace("agent-with-tools", async (run) => {
      await run.span(
        "search-docs",
        {
          type: "retrieval",
          attributes: { query: "neural networks", topK: 5, scoreThreshold: 0.8 },
        },
        async (span) => {
          expect(span.type).toBe("retrieval");
          expect(span.attributes.query).toBe("neural networks");
          return ["doc1", "doc2"];
        }
      );

      await run.span(
        "generate-summary",
        {
          type: "llm",
          attributes: { model: "claude-3-opus", temperature: 0.7 },
        },
        async () => {
          return "summary text";
        }
      );

      await run.span(
        "calculate-math",
        {
          type: "tool",
          attributes: { toolName: "calculator", expression: "2+2" },
        },
        async () => 4
      );

      await run.span(
        "sub-agent-planner",
        {
          type: "agent",
          attributes: { strategy: "reAct" },
        },
        async () => "plan"
      );
    });

    const trace = exporter.getLastTrace()!;
    expect(trace.spans.length).toBe(4);

    expect(trace.spans[0].type).toBe("retrieval");
    expect(trace.spans[0].attributes).toMatchObject({
      query: "neural networks",
      topK: 5,
    });

    expect(trace.spans[1].type).toBe("llm");
    expect(trace.spans[1].attributes.model).toBe("claude-3-opus");

    expect(trace.spans[2].type).toBe("tool");
    expect(trace.spans[2].attributes.toolName).toBe("calculator");

    expect(trace.spans[3].type).toBe("agent");
    expect(trace.spans[3].attributes.strategy).toBe("reAct");
  });

  it("preserves return values from span callbacks", async () => {
    const tracer = createTracer({ exporter: null });

    await tracer.trace("return-preservation", async (run) => {
      const obj = await run.span("span-obj", async () => ({ status: 200, data: [1, 2, 3] }));
      expect(obj).toEqual({ status: 200, data: [1, 2, 3] });

      const num = await run.span("span-num", async () => 99.9);
      expect(num).toBe(99.9);

      const str = await run.span("span-str", async () => "success");
      expect(str).toBe("success");
    });
  });

  it("captures span error, marks span as error, and re-throws original error", async () => {
    const exporter = new JsonExporter();
    const tracer = createTracer({ exporter });

    const spanError = new Error("Vector DB connection failed");

    await expect(
      tracer.trace("error-trace", async (run) => {
        await run.span("failing-retrieval", { type: "retrieval" }, async () => {
          throw spanError;
        });
      })
    ).rejects.toThrow("Vector DB connection failed");

    const trace = exporter.getLastTrace()!;
    expect(trace.status).toBe("error");
    expect(trace.spans.length).toBe(1);

    const span = trace.spans[0];
    expect(span.name).toBe("failing-retrieval");
    expect(span.status).toBe("error");
    expect(span.duration).toBeGreaterThanOrEqual(0);
    expect(span.error).toBeDefined();
    expect(span.error?.name).toBe("Error");
    expect(span.error?.message).toBe("Vector DB connection failed");
    expect(span.error?.stack).toBeDefined();
  });

  it("allows parent trace to handle caught span errors", async () => {
    const exporter = new JsonExporter();
    const tracer = createTracer({ exporter });

    await tracer.trace("graceful-recovery", async (run) => {
      try {
        await run.span("fallible-tool", async () => {
          throw new Error("Temporary rate limit");
        });
      } catch {
      }

      await run.span("fallback-tool", async () => {
        return "fallback result";
      });
    });

    const trace = exporter.getLastTrace()!;
    expect(trace.status).toBe("success");
    expect(trace.spans.length).toBe(2);

    expect(trace.spans[0].name).toBe("fallible-tool");
    expect(trace.spans[0].status).toBe("error");

    expect(trace.spans[1].name).toBe("fallback-tool");
    expect(trace.spans[1].status).toBe("success");
  });

  it("correctly models nested spans with parent-child relationships", async () => {
    const exporter = new JsonExporter();
    const tracer = createTracer({ exporter });

    await tracer.trace("research-agent", async (run) => {
      await run.span("agent-step", { type: "agent" }, async () => {
        await run.span("retrieval", { type: "retrieval" }, async () => {
          return "retrieved docs";
        });

        await run.span("llm", { type: "llm" }, async () => {
          return "model output";
        });
      });
    });

    const trace = exporter.getLastTrace()!;
    expect(trace.spans.length).toBe(3);

    const parentSpan = trace.spans[0];
    const retrievalSpan = trace.spans[1];
    const llmSpan = trace.spans[2];

    expect(parentSpan.name).toBe("agent-step");
    expect(parentSpan.parentId).toBeUndefined();

    expect(retrievalSpan.name).toBe("retrieval");
    expect(retrievalSpan.parentId).toBe(parentSpan.id);

    expect(llmSpan.name).toBe("llm");
    expect(llmSpan.parentId).toBe(parentSpan.id);
  });

  it("supports multi-level deep nesting (grandchild spans)", async () => {
    const exporter = new JsonExporter();
    const tracer = createTracer({ exporter });

    await tracer.trace("multi-level", async (run) => {
      await run.span("level-1", async () => {
        await run.span("level-2", async () => {
          await run.span("level-3", async () => {
            return "leaf";
          });
        });
      });
    });

    const trace = exporter.getLastTrace()!;
    expect(trace.spans.length).toBe(3);

    const s1 = trace.spans.find((s) => s.name === "level-1")!;
    const s2 = trace.spans.find((s) => s.name === "level-2")!;
    const s3 = trace.spans.find((s) => s.name === "level-3")!;

    expect(s1.parentId).toBeUndefined();
    expect(s2.parentId).toBe(s1.id);
    expect(s3.parentId).toBe(s2.id);
  });

  it("handles parallel sibling spans via Promise.all without context corruption", async () => {
    const exporter = new JsonExporter();
    const tracer = createTracer({ exporter });

    await tracer.trace("parallel-trace", async (run) => {
      await run.span("parent-task", async () => {
        await Promise.all([
          run.span("branch-a", async () => {
            await new Promise((r) => setTimeout(r, 10));
            await run.span("branch-a-child", async () => "child-a");
          }),
          run.span("branch-b", async () => {
            await new Promise((r) => setTimeout(r, 5));
            await run.span("branch-b-child", async () => "child-b");
          }),
        ]);
      });
    });

    const trace = exporter.getLastTrace()!;
    expect(trace.spans.length).toBe(5);

    const parent = trace.spans.find((s) => s.name === "parent-task")!;
    const branchA = trace.spans.find((s) => s.name === "branch-a")!;
    const branchB = trace.spans.find((s) => s.name === "branch-b")!;
    const childA = trace.spans.find((s) => s.name === "branch-a-child")!;
    const childB = trace.spans.find((s) => s.name === "branch-b-child")!;

    expect(parent.parentId).toBeUndefined();
    expect(branchA.parentId).toBe(parent.id);
    expect(branchB.parentId).toBe(parent.id);
    expect(childA.parentId).toBe(branchA.id);
    expect(childB.parentId).toBe(branchB.id);
  });

  it("allows setting and updating trace metadata via run methods", async () => {
    const exporter = new JsonExporter();
    const tracer = createTracer({ exporter });

    await tracer.trace("metadata-updates", async (run) => {
      run.setMetadata("sessionId", "sess-abc");
      run.addMetadata({ userId: "usr-123", tags: ["alpha", "beta"] });
    });

    const trace = exporter.getLastTrace()!;
    expect(trace.metadata.sessionId).toBe("sess-abc");
    expect(trace.metadata.userId).toBe("usr-123");
    expect(trace.metadata.tags).toEqual(["alpha", "beta"]);
  });
});
