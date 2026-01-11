// Generic execution tracer for serverless environments
// Tracks execution flow to debug non-traceable errors

export interface Context {
  trace_id: string;
  env_id: string;
  step_id: number;
}

export interface EnvRecord {
  type: 'env';
  env_id: string;
  trace_id: string;
  ts: number;
  source: string;
  payload: any;
}

export interface StepRecord {
  type: 'step';
  trace_id: string;
  env_id: string;
  step_id: number;
  at: number;
  node: string;
  status: 'enter' | 'exit' | 'error';
  meta?: any;
}

export type TraceRecord = EnvRecord | StepRecord;

const log: TraceRecord[] = [];

type NodeState = {
  currentStatus: 'idle' | 'entered' | 'exited' | 'errored';
  lastStepId: number;
};

type TraceState = {
  nodes: Map<StepRecord['node'], NodeState>;
  lastStepId: number;
  env_id: string;
  hasCriticalError: boolean;
};

const traceStates = new Map<string, TraceState>();

/**
 * Create a new trace environment for tracking execution
 * @param payload - The data being processed
 * @param source - Source identifier (default: 'unknown')
 * @returns Frozen context object with trace_id, env_id, and step_id
 * 
 * @example
 * ```typescript
 * const ctx = createEnv({ user_id: '123' }, 'webhook');
 * ```
 */
export function createEnv(payload: any, source: string = 'unknown'): Context {
  const trace_id = `tr_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const env_id = `env_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  
  if (!payload || typeof payload !== 'object') {
    throw new Error('createEnv: payload must be a valid object');
  }
  
  log.push({
    type: 'env',
    env_id,
    trace_id,
    ts: Date.now(),
    source,
    payload
  });
  
  traceStates.set(trace_id, {
    nodes: new Map(),
    lastStepId: 0,
    env_id,
    hasCriticalError: false
  });
  
  return Object.freeze({ trace_id, env_id, step_id: 0 });
}

/**
 * Log an execution step with state validation
 * @param ctx - Current trace context
 * @param node - Node name (e.g., 'validate', 'send')
 * @param status - Step status: 'enter', 'exit', or 'error'
 * @param meta - Optional metadata
 * @returns New frozen context with incremented step_id
 * 
 * @example
 * ```typescript
 * let ctx = createEnv(data);
 * ctx = step(ctx, 'validate', 'enter');
 * // do validation...
 * ctx = step(ctx, 'validate', 'exit', { valid: true });
 * ```
 */
export function step(
  ctx: Context,
  node: StepRecord['node'],
  status: StepRecord['status'] = 'enter',
  meta?: StepRecord['meta']
): Context {
  // Guard 1: Validate context
  if (!ctx || typeof ctx !== 'object') {
    throw new Error('step: invalid context');
  }
  
  if (!ctx.trace_id || !ctx.env_id) {
    throw new Error('step: context missing trace_id or env_id');
  }
  
  // Guard 2: Check trace state exists
  const traceState = traceStates.get(ctx.trace_id);
  if (!traceState) {
    throw new Error(`step: no trace state found for trace_id ${ctx.trace_id}`);
  }
  
  // Guard 3: Validate env_id
  if (ctx.env_id !== traceState.env_id) {
    throw new Error(`step: env_id mismatch - expected ${traceState.env_id}, got ${ctx.env_id}`);
  }
  
  // Guard 4: Validate step_id is sequential
  if (typeof ctx.step_id !== 'number' || ctx.step_id < 0) {
    throw new Error(`step: invalid step_id ${ctx.step_id} - must be non-negative number`);
  }
  
  if (ctx.step_id !== traceState.lastStepId) {
    throw new Error(`step: step_id out of sequence - expected ${traceState.lastStepId}, got ${ctx.step_id}`);
  }
  
  // Guard 5: Cannot continue after critical error
  if (traceState.hasCriticalError) {
    throw new Error(`step: trace ${ctx.trace_id} is in error state, cannot continue`);
  }
  
  // Get or create node state
  if (!traceState.nodes.has(node)) {
    traceState.nodes.set(node, { currentStatus: 'idle', lastStepId: -1 });
  }
  const nodeState = traceState.nodes.get(node)!;
  
  // Guard 6: Enforce state machine for enter/exit/error
  if (status === 'enter') {
    if (nodeState.currentStatus === 'entered') {
      throw new Error(`step: node '${node}' already entered - must exit before entering again`);
    }
  } else if (status === 'exit') {
    if (nodeState.currentStatus !== 'entered') {
      throw new Error(`step: node '${node}' cannot exit - not currently entered (status: ${nodeState.currentStatus})`);
    }
  } else if (status === 'error') {
    if (nodeState.currentStatus !== 'entered') {
      throw new Error(`step: node '${node}' cannot error - not currently entered (status: ${nodeState.currentStatus})`);
    }
    traceState.hasCriticalError = true;
  }
  
  // Log the step
  const newStepId = ctx.step_id + 1;
  log.push({
    type: 'step',
    trace_id: ctx.trace_id,
    env_id: ctx.env_id,
    step_id: newStepId,
    at: Date.now(),
    node,
    status,
    meta
  });
  
  // Update state
  nodeState.currentStatus = status === 'enter' ? 'entered' : (status === 'exit' ? 'exited' : 'errored');
  nodeState.lastStepId = newStepId;
  traceState.lastStepId = newStepId;
  
  return Object.freeze({ trace_id: ctx.trace_id, env_id: ctx.env_id, step_id: newStepId });
}

/**
 * Replay all steps for a given trace
 * @param traceId - The trace ID to replay
 * @returns Sorted array of trace records
 * 
 * @example
 * ```typescript
 * const trace = replay('tr_1234567890_abc');
 * console.log(trace); // All steps for that trace
 * ```
 */
export function replay(traceId: string): TraceRecord[] {
  if (!traceId || typeof traceId !== 'string') {
    throw new Error('replay: traceId must be a non-empty string');
  }
  
  return log
    .filter(x => x.trace_id === traceId)
    .sort((a, b) => {
      if (a.type === 'env') return -1;
      if (b.type === 'env') return 1;
      return ('step_id' in a ? a.step_id : 0) - ('step_id' in b ? b.step_id : 0);
    });
}

/**
 * Get all trace records (for debugging)
 * @returns Array of all trace records
 */
export function getAllTraces(): TraceRecord[] {
  return [...log];
}

/**
 * Get all active trace IDs
 * @returns Array of trace IDs
 */
export function getActiveTraces(): string[] {
  return Array.from(traceStates.keys());
}

/**
 * Clear all trace data (for testing)
 */
export function clearTraces(): void {
  log.length = 0;
  traceStates.clear();
}

/**
 * Get trace statistics
 * @returns Object with trace statistics
 */
export function getStats() {
  return {
    totalRecords: log.length,
    activeTraces: traceStates.size,
    traces: Array.from(traceStates.entries()).map(([trace_id, state]) => ({
      trace_id,
      env_id: state.env_id,
      steps: state.lastStepId,
      nodes: state.nodes.size,
      hasError: state.hasCriticalError
    }))
  };
}

