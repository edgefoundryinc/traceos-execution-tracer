# @traceos/execution-tracer

Generic execution tracer for serverless environments. Debug non-traceable errors by recording execution flow.

## Problem

In serverless environments (Cloudflare Workers, Lambda, etc.):
- No traditional debugger
- Limited error stack traces
- Heap state is lost between invocations
- Difficult to trace execution flow across async operations

## Solution

Track every step of execution with state validation to catch errors early and replay execution flow.

## Installation

```bash
npm install @traceos/execution-tracer
```

## Quick Start

```typescript
import { createEnv, step } from '@traceos/execution-tracer';

async function processWebhook(data) {
  // Create trace environment
  let ctx = createEnv(data, 'webhook');
  
  // Track validation step
  ctx = step(ctx, 'validate', 'enter');
  if (!data.user_id) {
    ctx = step(ctx, 'validate', 'error', { reason: 'missing user_id' });
    throw new Error('Invalid data');
  }
  ctx = step(ctx, 'validate', 'exit', { valid: true });
  
  // Track send step
  ctx = step(ctx, 'send', 'enter', { url: 'https://api.example.com' });
  try {
    await fetch('https://api.example.com', { method: 'POST', body: JSON.stringify(data) });
    ctx = step(ctx, 'send', 'exit', { success: true });
  } catch (error) {
    ctx = step(ctx, 'send', 'error', { error: error.message });
    throw error;
  }
  
  return { ok: true, trace_id: ctx.trace_id };
}
```

## API

### `createEnv(payload: any, source?: string): Context`

Creates a new trace environment with unique IDs.

**Parameters:**
- `payload` - The data being processed (any object)
- `source` - Source identifier (default: 'unknown')

**Returns:** Frozen `Context` object with `trace_id`, `env_id`, and `step_id`

**Example:**
```typescript
const ctx = createEnv({ user_id: '123' }, 'webhook');
// { trace_id: 'tr_...', env_id: 'env_...', step_id: 0 }
```

### `step(ctx: Context, node: string, status: 'enter' | 'exit' | 'error', meta?: any): Context`

Records an execution step and returns new context.

**Parameters:**
- `ctx` - Current trace context
- `node` - Node name (e.g., 'validate', 'send', 'transform')
- `status` - Step status: `'enter'`, `'exit'`, or `'error'`
- `meta` - Optional metadata object

**Returns:** New frozen `Context` with incremented `step_id`

**Example:**
```typescript
ctx = step(ctx, 'validate', 'enter');
// do work...
ctx = step(ctx, 'validate', 'exit', { result: 'valid' });
```

### `replay(traceId: string): TraceRecord[]`

Returns all records for a trace, sorted by step_id.

**Example:**
```typescript
const trace = replay('tr_1234567890_abc');
// [{ type: 'env', ... }, { type: 'step', ... }, ...]
```

### `getAllTraces(): TraceRecord[]`

Returns all trace records (for debugging).

### `getActiveTraces(): string[]`

Returns array of all active trace IDs.

### `getStats()`

Returns trace statistics including total records, active traces, and per-trace details.

### `clearTraces(): void`

Clears all trace data (for testing).

## State Machine

Each node follows a strict state machine:

```
idle → enter → exit → idle
       ↓
       error (terminal)
```

**Rules:**
- Must `enter` before `exit` or `error`
- Cannot `enter` twice without `exit`
- Cannot `exit` without `enter`
- After `error`, trace is terminal (no more steps allowed)

## Guards

The trace system enforces multiple guards:

1. **Context validation** - Ensures valid context object
2. **Trace state exists** - Trace must be initialized
3. **env_id integrity** - Prevents context tampering
4. **Sequential step_id** - Detects missing steps
5. **No steps after error** - Enforces terminal error state
6. **State machine** - Validates enter/exit/error transitions

## Real-World Example

```typescript
import { createEnv, step, replay } from '@traceos/execution-tracer';

export async function handleRequest(request: Request): Promise<Response> {
  let ctx = createEnv({ url: request.url }, 'http');
  
  try {
    // Parse body
    ctx = step(ctx, 'parse', 'enter');
    const body = await request.json();
    ctx = step(ctx, 'parse', 'exit', { bodySize: JSON.stringify(body).length });
    
    // Validate
    ctx = step(ctx, 'validate', 'enter');
    if (!body.event) {
      ctx = step(ctx, 'validate', 'error', { reason: 'missing event' });
      return new Response('Missing event', { status: 400 });
    }
    ctx = step(ctx, 'validate', 'exit');
    
    // Process
    ctx = step(ctx, 'process', 'enter');
    const result = await processEvent(body);
    ctx = step(ctx, 'process', 'exit', { result });
    
    return new Response(JSON.stringify({ ok: true, trace_id: ctx.trace_id }));
    
  } catch (error) {
    // Log trace for debugging
    const trace = replay(ctx.trace_id);
    console.error('Execution trace:', trace);
    
    return new Response('Internal error', { status: 500 });
  }
}
```

## TypeScript

Full TypeScript support with exported types:

```typescript
import type { Context, TraceRecord, EnvRecord, StepRecord } from '@traceos/execution-tracer';
```

## Use Cases

- **Serverless Functions** - Track execution in Cloudflare Workers, Lambda, etc.
- **API Handlers** - Debug request processing flows
- **Background Jobs** - Trace job execution
- **Data Pipelines** - Monitor transformation steps
- **Testing** - Verify correct execution order

## Performance

- Minimal overhead (~1-2ms per step)
- In-memory storage
- No external dependencies
- Frozen context objects (immutable)

## Testing

The package includes a comprehensive test suite:

```bash
cd packages/trace
npm install
npm test
```

See [TESTING.md](TESTING.md) for details.

## License

Apache 2.0 

