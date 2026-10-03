import { AsyncLocalStorage } from "node:async_hooks";

export interface SpanContext {
  traceId: string;
  spanId?: string;
}

export class ContextManager {
  private readonly storage: AsyncLocalStorage<SpanContext>;

  constructor() {
    this.storage = new AsyncLocalStorage<SpanContext>();
  }

  run<R>(context: SpanContext, callback: () => R): R {
    return this.storage.run(context, callback);
  }

  get(): SpanContext | undefined {
    return this.storage.getStore();
  }

  getActiveSpanId(): string | undefined {
    return this.storage.getStore()?.spanId;
  }
}
