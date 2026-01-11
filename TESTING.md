# Testing @traceos/execution-tracer

## Running Tests

```bash
cd packages/trace
npm install
npm test
```

## Test Coverage

The test suite covers:

### Core Functionality
- ✅ Environment creation (`createEnv`)
- ✅ Step tracking (`step`)
- ✅ Trace replay (`replay`)
- ✅ Statistics (`getStats`, `getActiveTraces`)
- ✅ Cleanup (`clearTraces`)

### State Machine
- ✅ Enter/Exit pairing enforcement
- ✅ Cannot exit without enter
- ✅ Cannot enter twice without exit
- ✅ Error state handling
- ✅ Terminal error state (no steps after error)

### Guards
- ✅ Context validation
- ✅ Trace state existence
- ✅ env_id integrity check
- ✅ Sequential step_id enforcement
- ✅ Invalid step_id detection

### Edge Cases
- ✅ Invalid payloads
- ✅ Multiple concurrent traces
- ✅ Context immutability
- ✅ Error metadata preservation
- ✅ Complex workflow simulation

## Test Structure

```typescript
// Each test follows this pattern:
const testName = test('Test description', () => {
  // Setup
  let ctx = createEnv({ data: 'test' }, 'test');
  
  // Execute
  ctx = step(ctx, 'validate', 'enter');
  
  // Assert
  assertEqual(ctx.step_id, 1, 'Step ID should increment');
});
```

## Writing New Tests

Add new tests in `src/test.ts`:

```typescript
const testNewFeature = test('New feature description', () => {
  // Your test code here
  assert(condition, 'Assertion message');
});

// Add to the tests array in runTests()
const tests = [
  // ... existing tests
  testNewFeature
];
```

## Continuous Integration

Tests run automatically on:
- Every push to main/master
- Every pull request
- Multiple Node.js versions (18.x, 20.x, 21.x)

See `.github/workflows/test.yml` for CI configuration.

## Pre-publish Checks

Before publishing to npm, the following runs automatically:

```bash
npm run prepublishOnly
```

This executes:
1. `npm test` - Run all tests
2. `npm run build` - Build TypeScript

If any test fails, publishing is blocked.

## Manual Testing

Test in a real project before publishing:

```bash
# In packages/trace
npm pack

# In another project
npm install /path/to/traceos-execution-tracer-1.0.1.tgz

# Use in code
import { createEnv, step } from '@traceos/execution-tracer';
```

## Test Output

Successful test run:
```
🧪 Running @traceos/execution-tracer tests...

▶ Create environment
  ✓ Passed

▶ Step tracking
  ✓ Passed

...

==================================================
✅ Tests passed: 45
❌ Tests failed: 0
==================================================
```

Failed test:
```
▶ Test name
  ❌ FAIL: Error message
    Expected: value1
    Actual: value2
  ✗ Failed: Error message
```
