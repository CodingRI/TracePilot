import { createTracer } from "../src/index.js";

const tracer = createTracer();

async function main() {
  const result = await tracer.trace("research-agent", async (run) => {
    const documents = await run.span(
      "retrieval",
      {
        type: "retrieval",
        attributes: {
          query: "AI agent observability and tracing",
          topK: 3,
        },
      },
      async () => {
        await new Promise((resolve) => setTimeout(resolve, 120));
        return ["doc_agent_patterns.pdf", "doc_evals.pdf", "doc_tracing.pdf"];
      }
    );

    const answer = await run.span(
      "llm",
      {
        type: "llm",
        attributes: {
          model: "gpt-4o",
          temperature: 0.2,
          inputTokens: 350,
          outputTokens: 85,
        },
      },
      async () => {
        await new Promise((resolve) => setTimeout(resolve, 340));
        return `Synthesized insights from ${documents.length} sources.`;
      }
    );

    await run.span(
      "tool",
      {
        type: "tool",
        attributes: {
          toolName: "save_summary",
          destination: "workspace/notes.md",
        },
      },
      async () => {
        await new Promise((resolve) => setTimeout(resolve, 60));
        return { status: "saved" };
      }
    );

    return { answer };
  });

  console.log("\nAgent output:", result);
}

main().catch(console.error);
