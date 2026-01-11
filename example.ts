// Example usage of @traceos/execution-tracer

import { createEnv, step, replay, getStats } from './src/index';

// Example 1: Basic usage
async function basicExample() {
  console.log('\n=== Basic Example ===');
  
  let ctx = createEnv({ user_id: '123', action: 'login' }, 'api');
  console.log('Created trace:', ctx.trace_id);
  
  // Enter and exit a node
  ctx = step(ctx, 'validate', 'enter');
  ctx = step(ctx, 'validate', 'exit', { valid: true });
  
  ctx = step(ctx, 'authenticate', 'enter');
  ctx = step(ctx, 'authenticate', 'exit', { success: true });
  
  // Replay the trace
  const trace = replay(ctx.trace_id);
  console.log('Trace steps:', trace.length);
  trace.forEach(record => {
    if (record.type === 'step') {
      console.log(`  ${record.step_id}. ${record.node} - ${record.status}`);
    }
  });
}

// Example 2: Error handling
async function errorExample() {
  console.log('\n=== Error Example ===');
  
  let ctx = createEnv({ data: 'invalid' }, 'webhook');
  
  try {
    ctx = step(ctx, 'validate', 'enter');
    
    // Simulate validation failure
    if (true) {
      ctx = step(ctx, 'validate', 'error', { reason: 'invalid data' });
      throw new Error('Validation failed');
    }
    
    // This won't execute
    ctx = step(ctx, 'validate', 'exit');
  } catch (error) {
    console.log('Error caught:', error.message);
    console.log('Trace ID for debugging:', ctx.trace_id);
    
    // Replay to see what happened
    const trace = replay(ctx.trace_id);
    const errorStep = trace.find(r => r.type === 'step' && r.status === 'error');
    console.log('Error step:', errorStep);
  }
}

// Example 3: Real-world API handler
async function apiHandlerExample(request: { url: string; body: any }) {
  console.log('\n=== API Handler Example ===');
  
  let ctx = createEnv(request.body, 'http');
  
  try {
    // Parse step
    ctx = step(ctx, 'parse', 'enter');
    const data = request.body;
    ctx = step(ctx, 'parse', 'exit', { size: JSON.stringify(data).length });
    
    // Validate step
    ctx = step(ctx, 'validate', 'enter');
    if (!data.event) {
      ctx = step(ctx, 'validate', 'error', { reason: 'missing event' });
      return { status: 400, error: 'Missing event', trace_id: ctx.trace_id };
    }
    ctx = step(ctx, 'validate', 'exit');
    
    // Process step
    ctx = step(ctx, 'process', 'enter');
    await simulateAsyncWork();
    ctx = step(ctx, 'process', 'exit', { processed: true });
    
    // Send step
    ctx = step(ctx, 'send', 'enter', { destination: 'webhook' });
    await simulateWebhookSend();
    ctx = step(ctx, 'send', 'exit', { sent: true });
    
    return { status: 200, ok: true, trace_id: ctx.trace_id };
    
  } catch (error) {
    console.error('Handler error:', error);
    const trace = replay(ctx.trace_id);
    console.log('Full trace:', JSON.stringify(trace, null, 2));
    return { status: 500, error: 'Internal error', trace_id: ctx.trace_id };
  }
}

// Example 4: Statistics
function statsExample() {
  console.log('\n=== Statistics Example ===');
  
  const stats = getStats();
  console.log('Total records:', stats.totalRecords);
  console.log('Active traces:', stats.activeTraces);
  console.log('\nTraces:');
  stats.traces.forEach(t => {
    console.log(`  ${t.trace_id}: ${t.steps} steps, ${t.nodes} nodes, error: ${t.hasError}`);
  });
}

// Helper functions
function simulateAsyncWork() {
  return new Promise(resolve => setTimeout(resolve, 10));
}

function simulateWebhookSend() {
  return new Promise(resolve => setTimeout(resolve, 10));
}

// Run examples
async function runExamples() {
  await basicExample();
  await errorExample();
  await apiHandlerExample({ 
    url: 'https://api.example.com/webhook',
    body: { event: 'user.login', user_id: '123' }
  });
  statsExample();
}

runExamples().catch(console.error);

