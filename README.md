# TracePilot

TracePilot is a lightweight, framework-agnostic observability and tracing SDK engineered specifically for AI agents. Rather than focusing solely on isolated LLM calls, TracePilot captures the full end-to-end execution lifecycle of compound AI systems--including agent reasoning loops, tool interactions, RAG retrieval steps, latency, errors, and hierarchically nested operations--with zero runtime dependencies.

## Why TracePilot?

Debugging AI agents is notoriously challenging. Unlike traditional deterministic software with predictable stack traces, modern agents:
- Execute multi-step decision loops where intermediate plans dynamically alter downstream actions.
- Interleave external vector database queries, tool invocations, and LLM completions.
- Suffer from non-fatal partial failures (e.g. fallback tools, query reformulations) that standard application monitors fail to visualize.
- Often run with heavy frameworks that introduce massive runtime dependency bloat and complex setup steps.

TracePilot provides a minimal, non-intrusive foundation for understanding what your agent actually did, why it made specific tool decisions, where latency was spent, and how nested sub-tasks relate to the overarching goal.

## Installation

```bash
npm install tracepilot
```

## Basic Usage

```typescript
import { createTracer } from "tracepilot";

const tracer = createTracer();

const result = await tracer.trace("research-agent", async (run) => {
  const docs = await run.span(
    "vector-search",
    {
      type: "retrieval",
      attributes: { query: "agent architectures", topK: 3 }
    },
    async () => {
      return searchVectorDb("agent architectures", 3);
    }
  );

  const summary = await run.span(
    "llm-synthesis",
    {
      type: "llm",
      attributes: { model: "gpt-4o", temperature: 0.2 }
    },
    async () => {
      return callModel(docs);
    }
  );

  return summary;
});
```

When run, TracePilot automatically outputs a clean visual execution tree:

```text
[TracePilot] research-agent
├─ vector-search               120ms ✓
└─ llm-synthesis               840ms ✓

Total: 962ms
Status: success
```

## Spans

Spans represent discrete units of work within an agent run. TracePilot categorizes operations using semantic types:

| Span Type | Typical Usage | Common Attributes |
| :--- | :--- | :--- |
| `llm` | Language model calls, completions, embeddings | `model`, `temperature`, `inputTokens`, `outputTokens` |
| `tool` | API calls, calculators, code interpreters, bash scripts | `toolName`, `input`, `output` |
| `retrieval` | Vector search, document retrieval, web search, database queries | `query`, `topK`, `scoreThreshold`, `source` |
| `agent` | Sub-agents, planner steps, decision nodes | `strategy`, `step`, `plan` |
| `custom` | Custom application business logic (default) | Any user-defined key-value attributes |

### Span API

You can create spans using either the shorthand syntax or with options:

```typescript
await run.span("compute-hash", async () => { ... });

await run.span(
  "fetch-customer",
  {
    type: "tool",
    attributes: { customerId: "cust_123" }
  },
  async (span) => {
    span.setAttribute("cached", false);
    return fetchCustomer("cust_123");
  }
);
```

## Nested Spans

Agent workflows are inherently hierarchical. In TracePilot, spans seamlessly nest within other spans without requiring global mutable state. Context is tracked across asynchronous boundaries using Node.js `AsyncLocalStorage`:

```typescript
await tracer.trace("customer-support-agent", async (run) => {
  await run.span("retrieve-context", { type: "agent" }, async () => {
    await run.span("customer-profile", { type: "retrieval" }, async () => {
      return fetchProfile();
    });

    await run.span("knowledge-base", { type: "retrieval" }, async () => {
      return searchFaq();
    });
  });

  await run.span("llm-response", { type: "llm" }, async () => {
    return generateResponse();
  });
});
```

Formatted output:
```text
[TracePilot] customer-support-agent
├─ retrieve-context            180ms ✓
│  ├─ customer-profile          60ms ✓
│  └─ knowledge-base           120ms ✓
└─ llm-response                450ms ✓

Total: 635ms
Status: success
```

## Error Handling

TracePilot ensures observability never swallows or obscures application errors:

1. **Span-level errors**: If a span callback throws, the span is marked as `"error"`, error details (`name`, `message`, `stack`) and elapsed duration are captured, and the original error is immediately re-thrown.
2. **Graceful recovery**: If your agent catches and handles a tool failure (e.g. trying a fallback tool), the span remains marked as `"error"` for debugging, while the overall trace can still succeed.
3. **Trace-level errors**: If an uncaught exception escapes the trace callback, the entire trace is marked as `"error"`, error details are recorded, the trace is exported, and the exact error is re-thrown to the caller.

```typescript
try {
  await tracer.trace("unstable-task", async (run) => {
    await run.span("fragile-tool", async () => {
      throw new Error("Connection refused");
    });
  });
} catch (err) {
}
```

Console output on failure:
```text
[TracePilot] unstable-task
└─ fragile-tool                 45ms ✗ (Error: Connection refused)

Total: 47ms
Status: error (Error: Connection refused)
```

## Exporters & Configuration

`createTracer()` accepts optional configuration:

```typescript
import { createTracer, ConsoleExporter, JsonExporter } from "tracepilot";

const tracer = createTracer();

const jsonExporter = new JsonExporter();
const tracerWithJson = createTracer({ exporter: jsonExporter });

const silentTracer = createTracer({ exporter: null });
```

### Exporter Design Decision: Why ConsoleExporter by Default?

In TracePilot V0.1, `createTracer()` defaults to `ConsoleExporter`. 

**Rationale:**
- **Zero-config developer velocity**: Developers adopting TracePilot get immediate terminal visibility on their first run without having to configure pipelines or external collectors.
- **Explicit silence when desired**: If you're running in an environment where console output is not desired, passing `{ exporter: null }` or `{ exporter: new JsonExporter() }` explicitly disables or redirects trace output.

## Roadmap

TracePilot V0.1 establishes a clean, zero-dependency foundation. Planned future capabilities include:

- [ ] **LLM Token Tracking**: Capture input, completion, and reasoning tokens per model provider.
- [ ] **Cost Estimation**: Automatic cost calculation based on model token pricing.
- [ ] **Automatic LLM Instrumentation**: Wrapper integrations for OpenAI, Anthropic, and Google GenAI SDKs.
- [ ] **RAG Retrieval Metadata**: Chunk IDs, similarity metrics, reranking scores, and embedding models.
- [ ] **MCP Instrumentation**: Native tracing for Model Context Protocol client and server calls.
- [ ] **LangGraph Integration**: Native hook callbacks for graph transitions and state snapshots.
- [ ] **OpenTelemetry Exporter**: OTLP / OpenTelemetry standard trace export.
- [ ] **Local Trace Viewer**: Standalone web UI for interactive timeline and waterfall visualization.
- [ ] **Trace Persistence**: Pluggable storage adapters (file, SQLite, PostgreSQL).
- [ ] **Trace Replay**: Re-running past agent steps with cached LLM completions.
- [ ] **Evaluation Integration**: Seamless export to evaluation frameworks and datasets.

## License

MIT (c) TracePilot Contributors
