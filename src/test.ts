// Test suite for @traceos/execution-tracer

import { createEnv, step, replay, getAllTraces, clearTraces, getStats, getActiveTraces } from './index.js';
import type { Context } from './index.js';

let testsPassed = 0;
let testsFailed = 0;

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ FAIL: ${message}`);
    testsFailed++;
    throw new Error(message);
  }
  testsPassed++;
}

function assertEqual(actual: any, expected: any, message: string) {
  if (actual !== expected) {
    console.error(`❌ FAIL: ${message}`);
    console.error(`  Expected: ${expected}`);
    console.error(`  Actual: ${actual}`);
    testsFailed++;
    throw new Error(message);
  }
  testsPassed++;
}

function test(name: string, fn: () => void | Promise<void>) {
  return async () => {
    clearTraces();
    console.log(`\n▶ ${name}`);
    try {
      await fn();
      console.log(`  ✓ Passed`);
    } catch (error) {
      console.error(`  ✗ Failed: ${(error as Error).message}`);
    }
  };
}

// Test 1: Basic trace creation
const testCreateEnv = test('Create environment', () => {
  const ctx = createEnv({ test: 'data' }, 'test');
  
  assert(ctx.trace_id.startsWith('tr_'), 'trace_id should start with tr_');
  assert(ctx.env_id.startsWith('env_'), 'env_id should start with env_');
  assertEqual(ctx.step_id, 0, 'Initial step_id should be 0');
  
  const traces = getAllTraces();
  assertEqual(traces.length, 1, 'Should have 1 trace record');
  assertEqual(traces[0].type, 'env', 'First record should be env type');
});

// Test 2: Step tracking
const testStepTracking = test('Step tracking', () => {
  let ctx = createEnv({ data: 'test' }, 'test');
  
  ctx = step(ctx, 'validate', 'enter');
  assertEqual(ctx.step_id, 1, 'Step ID should increment');
  
  ctx = step(ctx, 'validate', 'exit');
  assertEqual(ctx.step_id, 2, 'Step ID should increment again');
  
  const trace = replay(ctx.trace_id);
  assertEqual(trace.length, 3, 'Should have 3 records (env + 2 steps)');
});

// Test 3: Enter/Exit pairing enforcement
const testEnterExitPairing = test('Enter/Exit pairing enforcement', () => {
  let ctx = createEnv({ data: 'test' }, 'test');
  
  // Cannot exit without enter
  try {
    step(ctx, 'validate', 'exit');
    assert(false, 'Should throw error when exiting without enter');
  } catch (error) {
    assert((error as Error).message.includes('cannot exit'), 'Should error on exit without enter');
  }
  
  // Cannot enter twice
  ctx = step(ctx, 'validate', 'enter');
  try {
    step(ctx, 'validate', 'enter');
    assert(false, 'Should throw error when entering twice');
  } catch (error) {
    assert((error as Error).message.includes('already entered'), 'Should error on double enter');
  }
});

// Test 4: Error state
const testErrorState = test('Error state handling', () => {
  let ctx = createEnv({ data: 'test' }, 'test');
  
  ctx = step(ctx, 'validate', 'enter');
  ctx = step(ctx, 'validate', 'error', { reason: 'invalid' });
  
  // Cannot continue after error
  try {
    step(ctx, 'send', 'enter');
    assert(false, 'Should not allow steps after error');
  } catch (error) {
    assert((error as Error).message.includes('error state'), 'Should error after critical error');
  }
});

// Test 5: Context validation
const testContextValidation = test('Context validation', () => {
  // Invalid context
  try {
    step(null as any, 'test', 'enter');
    assert(false, 'Should throw on null context');
  } catch (error) {
    assert((error as Error).message.includes('invalid context'), 'Should validate context');
  }
  
  // Missing trace_id
  try {
    step({ env_id: 'test', step_id: 0 } as any, 'test', 'enter');
    assert(false, 'Should throw on missing trace_id');
  } catch (error) {
    assert((error as Error).message.includes('missing trace_id'), 'Should validate trace_id');
  }
});

// Test 6: Sequential step_id
const testSequentialStepId = test('Sequential step_id enforcement', () => {
  let ctx = createEnv({ data: 'test' }, 'test');
  ctx = step(ctx, 'validate', 'enter');
  
  // Try to skip a step
  const invalidCtx = { ...ctx, step_id: 5 };
  try {
    step(invalidCtx, 'validate', 'exit');
    assert(false, 'Should throw on non-sequential step_id');
  } catch (error) {
    assert((error as Error).message.includes('out of sequence'), 'Should enforce sequential steps');
  }
});

// Test 7: env_id integrity
const testEnvIdIntegrity = test('env_id integrity check', () => {
  let ctx = createEnv({ data: 'test' }, 'test');
  
  // Tamper with env_id
  const tamperedCtx = { ...ctx, env_id: 'tampered' };
  try {
    step(tamperedCtx, 'validate', 'enter');
    assert(false, 'Should throw on tampered env_id');
  } catch (error) {
    assert((error as Error).message.includes('env_id mismatch'), 'Should detect env_id tampering');
  }
});

// Test 8: Replay functionality
const testReplay = test('Replay functionality', () => {
  let ctx = createEnv({ data: 'test' }, 'test');
  const traceId = ctx.trace_id;
  
  ctx = step(ctx, 'validate', 'enter');
  ctx = step(ctx, 'validate', 'exit');
  ctx = step(ctx, 'send', 'enter');
  ctx = step(ctx, 'send', 'exit');
  
  const trace = replay(traceId);
  
  assertEqual(trace.length, 5, 'Should have 5 records');
  assertEqual(trace[0].type, 'env', 'First should be env');
  assertEqual(trace[1].type, 'step', 'Rest should be steps');
  
  // Verify sorting
  for (let i = 1; i < trace.length; i++) {
    if (trace[i].type === 'step') {
      const step1 = trace[i] as any;
      const step2 = trace[i + 1] as any;
      if (step2) {
        assert(step1.step_id < step2.step_id, 'Steps should be sorted by step_id');
      }
    }
  }
});

// Test 9: Multiple traces
const testMultipleTraces = test('Multiple traces', () => {
  const ctx1 = createEnv({ data: '1' }, 'test');
  const ctx2 = createEnv({ data: '2' }, 'test');
  
  assert(ctx1.trace_id !== ctx2.trace_id, 'Traces should have unique IDs');
  
  const activeTraces = getActiveTraces();
  assertEqual(activeTraces.length, 2, 'Should have 2 active traces');
});

// Test 10: Statistics
const testStatistics = test('Statistics', () => {
  let ctx = createEnv({ data: 'test' }, 'test');
  ctx = step(ctx, 'validate', 'enter');
  ctx = step(ctx, 'validate', 'exit');
  
  const stats = getStats();
  
  assertEqual(stats.activeTraces, 1, 'Should have 1 active trace');
  assert(stats.totalRecords >= 3, 'Should have at least 3 records');
  assertEqual(stats.traces[0].steps, 2, 'Should have 2 steps');
  assertEqual(stats.traces[0].hasError, false, 'Should not have error');
});

// Test 11: Error metadata
const testErrorMetadata = test('Error metadata', () => {
  let ctx = createEnv({ data: 'test' }, 'test');
  
  ctx = step(ctx, 'validate', 'enter');
  ctx = step(ctx, 'validate', 'error', { reason: 'invalid data', code: 400 });
  
  const trace = replay(ctx.trace_id);
  const errorStep = trace.find(r => r.type === 'step' && r.status === 'error') as any;
  
  assert(errorStep, 'Should have error step');
  assertEqual(errorStep.meta.reason, 'invalid data', 'Should preserve error metadata');
  assertEqual(errorStep.meta.code, 400, 'Should preserve error code');
});

// Test 12: Clear traces
const testClearTraces = test('Clear traces', () => {
  createEnv({ data: 'test' }, 'test');
  
  let traces = getAllTraces();
  assert(traces.length > 0, 'Should have traces before clear');
  
  clearTraces();
  
  traces = getAllTraces();
  assertEqual(traces.length, 0, 'Should have no traces after clear');
  assertEqual(getActiveTraces().length, 0, 'Should have no active traces');
});

// Test 13: Invalid payload
const testInvalidPayload = test('Invalid payload', () => {
  try {
    createEnv(null, 'test');
    assert(false, 'Should throw on null payload');
  } catch (error) {
    assert((error as Error).message.includes('must be a valid object'), 'Should validate payload');
  }
  
  try {
    createEnv('string' as any, 'test');
    assert(false, 'Should throw on string payload');
  } catch (error) {
    assert((error as Error).message.includes('must be a valid object'), 'Should validate payload type');
  }
});

// Test 14: Complex workflow
const testComplexWorkflow = test('Complex workflow simulation', () => {
  let ctx = createEnv({ user_id: '123', action: 'purchase' }, 'api');
  
  // Validation phase
  ctx = step(ctx, 'validate', 'enter');
  ctx = step(ctx, 'validate', 'exit', { valid: true });
  
  // Authentication phase
  ctx = step(ctx, 'auth', 'enter');
  ctx = step(ctx, 'auth', 'exit', { authenticated: true });
  
  // Process phase
  ctx = step(ctx, 'process', 'enter');
  ctx = step(ctx, 'process', 'exit', { result: 'success' });
  
  // Send phase
  ctx = step(ctx, 'send', 'enter', { destination: 'webhook' });
  ctx = step(ctx, 'send', 'exit', { sent: true });
  
  const trace = replay(ctx.trace_id);
  assertEqual(trace.length, 9, 'Should have 9 records (1 env + 8 steps)');
  
  const stats = getStats();
  assertEqual(stats.traces[0].nodes, 4, 'Should have 4 unique nodes');
});

// Test 15: Context immutability
const testContextImmutability = test('Context immutability', () => {
  const ctx = createEnv({ data: 'test' }, 'test');
  
  // Try to modify context
  try {
    (ctx as any).trace_id = 'modified';
    assert(false, 'Should not allow modification of frozen context');
  } catch (error) {
    // Expected - context is frozen
  }
  
  // Verify context hasn't changed
  assert(ctx.trace_id.startsWith('tr_'), 'Context should remain unchanged');
});

// Run all tests
async function runTests() {
  console.log('🧪 Running @traceos/execution-tracer tests...\n');
  
  const tests = [
    testCreateEnv,
    testStepTracking,
    testEnterExitPairing,
    testErrorState,
    testContextValidation,
    testSequentialStepId,
    testEnvIdIntegrity,
    testReplay,
    testMultipleTraces,
    testStatistics,
    testErrorMetadata,
    testClearTraces,
    testInvalidPayload,
    testComplexWorkflow,
    testContextImmutability
  ];
  
  for (const testFn of tests) {
    await testFn();
  }
  
  console.log('\n' + '='.repeat(50));
  console.log(`✅ Tests passed: ${testsPassed}`);
  console.log(`❌ Tests failed: ${testsFailed}`);
  console.log('='.repeat(50));
  
  if (testsFailed > 0) {
    process.exit(1);
  }
}

runTests().catch(error => {
  console.error('Test suite failed:', error);
  process.exit(1);
});
