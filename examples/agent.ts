import { createTracer } from "../src/index.js";

const tracer = createTracer();

async function runCustomerSupportAgent(query: string, customerId: string) {
  return tracer.trace(
    "support-agent-workflow",
    {
      metadata: {
        customerId,
        environment: "production",
        version: "1.2.0",
      },
    },
    async (run) => {
      const context = await run.span(
        "retrieve-context-step",
        { type: "agent", attributes: { step: 1 } },
        async () => {
          const history = await run.span(
            "lookup-customer-profile",
            {
              type: "retrieval",
              attributes: { customerId, source: "crm" },
            },
            async () => {
              await new Promise((r) => setTimeout(r, 60));
              return { tier: "enterprise", openTickets: 1 };
            }
          );

          const articles = await run.span(
            "search-knowledge-base",
            {
              type: "retrieval",
              attributes: { query, topK: 3 },
            },
            async () => {
              await new Promise((r) => setTimeout(r, 95));
              return ["KB-104: Billing FAQ", "KB-208: Refund Policy"];
            }
          );

          return { history, articles };
        }
      );

      const actionPlan = await run.span(
        "plan-resolution",
        { type: "agent", attributes: { step: 2 } },
        async () => {
          const plan = await run.span(
            "llm-planner",
            {
              type: "llm",
              attributes: {
                model: "gpt-4o",
                temperature: 0.1,
                promptTokens: 412,
                completionTokens: 64,
              },
            },
            async () => {
              await new Promise((r) => setTimeout(r, 220));
              return { action: "issue_credit", amount: 25.0 };
            }
          );

          const toolResult = await run.span(
            "billing-api-credit-customer",
            {
              type: "tool",
              attributes: {
                toolName: "billing_credit_api",
                customerId,
                amount: plan.amount,
              },
            },
            async () => {
              await new Promise((r) => setTimeout(r, 110));
              return { transactionId: "tx_998822", success: true };
            }
          );

          return { plan, toolResult };
        }
      );

      const finalReply = await run.span(
        "generate-final-response",
        {
          type: "llm",
          attributes: { model: "gpt-4o", promptTokens: 680, completionTokens: 110 },
        },
        async () => {
          await new Promise((r) => setTimeout(r, 180));
          return `Hello! As an Enterprise member, we've credited $25.00 to your account (Ref: ${actionPlan.toolResult.transactionId}).`;
        }
      );

      run.setMetadata("totalSpansExecuted", run.spans.length);

      return {
        reply: finalReply,
        tier: context.history.tier,
        transactionId: actionPlan.toolResult.transactionId,
      };
    }
  );
}

async function main() {
  console.log("Starting Customer Support Agent run...\n");

  const response = await runCustomerSupportAgent(
    "I was charged twice for subscription renewal",
    "cust_enterprise_8871"
  );

  console.log("\nAgent Final Output:\n", response);
}

main().catch(console.error);
