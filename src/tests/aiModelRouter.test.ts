/**
 * MURSAL JARVIS — AI Model Router Circuit Breaker Verification Suite
 * 
 * Verifies:
 * 1. 429 error tracking for Gemini models
 * 2. Moving model to 'COOLDOWN' state for configurable duration
 * 3. Immediate routing of subsequent requests to secondary fallback model
 * 4. Zero network invocation for models in COOLDOWN
 * 5. HALF_OPEN probation canary recovery after cooldown expires
 * 6. Multi-tier failover down to Sovereign Edge Brain
 * 7. Global and per-model configurable cooldown duration overrides
 */

import { AIModelRouter } from '../lib/aiModelRouter';

async function runCircuitBreakerTests() {
  console.log('================================================================');
  console.log(' RUNNING AI MODEL ROUTER CIRCUIT BREAKER VERIFICATION SUITE');
  console.log('================================================================\n');

  let passed = 0;
  const total = 7;

  // --------------------------------------------------------------------------
  // TEST 1: Initial state is ONLINE and circuit is CLOSED
  // --------------------------------------------------------------------------
  console.log('[TEST 1] Verifying initial model state and circuit breaker...');
  const router = new AIModelRouter();
  const primaryId = 'gemini-3.8-flash';
  const secondaryId = 'gemini-2.5-flash';

  const initialPrimaryMetrics = router.getCircuitBreakerMetrics(primaryId);
  if (initialPrimaryMetrics.state !== 'CLOSED' || initialPrimaryMetrics.consecutive429Count !== 0) {
    throw new Error(`TEST 1 FAILED: Expected CLOSED state, got ${initialPrimaryMetrics.state}`);
  }
  const descriptors = router.getModelDescriptors();
  const primaryDesc = descriptors.find((m) => m.id === primaryId);
  if (primaryDesc?.status !== 'ONLINE') {
    throw new Error(`TEST 1 FAILED: Expected ONLINE status, got ${primaryDesc?.status}`);
  }
  console.log('  -> PASS: Primary Gemini model initializes ONLINE with CLOSED circuit.');
  passed++;

  // --------------------------------------------------------------------------
  // TEST 2: 429 error triggers COOLDOWN state for configurable duration
  // --------------------------------------------------------------------------
  console.log('\n[TEST 2] Verifying 429 error moves model to COOLDOWN state for configured duration...');
  // Configure cooldown duration to 45,000ms
  router.setCooldownDuration(45000);
  if (router.getCooldownDuration() !== 45000) {
    throw new Error(`TEST 2 FAILED: Expected global cooldown 45000ms, got ${router.getCooldownDuration()}`);
  }

  // Simulate a 429 error from Gemini
  const error429 = new Error('HTTP Error 429: Resource has been exhausted (e.g. check quota)');
  (error429 as any).status = 429;
  router.recordFailure(primaryId, error429, 429);

  const updatedMetrics = router.getCircuitBreakerMetrics(primaryId);
  const updatedDesc = router.getModelDescriptors().find((m) => m.id === primaryId);

  if (updatedDesc?.status !== 'COOLDOWN') {
    throw new Error(`TEST 2 FAILED: Expected status 'COOLDOWN', got '${updatedDesc?.status}'`);
  }
  if (updatedMetrics.state !== 'OPEN') {
    throw new Error(`TEST 2 FAILED: Expected circuit state 'OPEN', got '${updatedMetrics.state}'`);
  }
  if (updatedMetrics.consecutive429Count !== 1 || updatedMetrics.total429Count !== 1) {
    throw new Error(`TEST 2 FAILED: Expected 429 count 1, got consecutive=${updatedMetrics.consecutive429Count}`);
  }
  const remainingMs = router.getCooldownRemainingMs(primaryId);
  if (remainingMs <= 0 || remainingMs > 45000) {
    throw new Error(`TEST 2 FAILED: Cooldown remaining unexpected: ${remainingMs}ms`);
  }
  console.log(`  -> PASS: 429 moved primary Gemini to COOLDOWN (OPEN circuit, ${Math.ceil(remainingMs / 1000)}s remaining).`);
  passed++;

  // --------------------------------------------------------------------------
  // TEST 3: Model is not callable while in COOLDOWN
  // --------------------------------------------------------------------------
  console.log('\n[TEST 3] Verifying isModelCallable returns false while in COOLDOWN...');
  const callable = router.isModelCallable(updatedDesc!);
  if (callable) {
    throw new Error('TEST 3 FAILED: Model in COOLDOWN was reported as callable');
  }
  console.log('  -> PASS: isModelCallable correctly returned false for model in COOLDOWN.');
  passed++;

  // --------------------------------------------------------------------------
  // TEST 4: Immediate routing of subsequent requests to secondary fallback model
  // --------------------------------------------------------------------------
  console.log('\n[TEST 4] Verifying immediate routing of subsequent requests to secondary fallback...');
  let invokedModels: string[] = [];

  // Mock invokeServerBackend via monkey patching
  (router as any).invokeServerBackend = async (_req: any, modelId: string) => {
    invokedModels.push(modelId);
    if (modelId === primaryId) {
      throw new Error('Primary model should NOT have been invoked while in COOLDOWN!');
    }
    if (modelId === secondaryId) {
      return { reply: 'Mursaleen, I am executing via secondary Gemini 2.5 Flash cloud fallback.' };
    }
    return { reply: 'Fallback response' };
  };

  const req = {
    prompt: 'Check Karachi warehouse inventory for MursalCart',
    language: 'ur-Roman',
  };

  const result = await router.routeAndExecute(req);

  if (invokedModels.includes(primaryId)) {
    throw new Error('TEST 4 FAILED: Primary model was invoked despite being in COOLDOWN!');
  }
  if (!invokedModels.includes(secondaryId)) {
    throw new Error('TEST 4 FAILED: Secondary fallback model was not invoked!');
  }
  if (result.engineMode !== 'GEMINI_CLOUD_SECONDARY' || result.modelTier !== 2) {
    throw new Error(`TEST 4 FAILED: Expected GEMINI_CLOUD_SECONDARY tier 2, got ${result.engineMode}`);
  }
  if (result.routingReport.selectedModel !== secondaryId) {
    throw new Error(`TEST 4 FAILED: Expected selectedModel ${secondaryId}, got ${result.routingReport.selectedModel}`);
  }
  if (result.routingReport.primaryModel !== primaryId) {
    throw new Error(`TEST 4 FAILED: Expected primaryModel ${primaryId}, got ${result.routingReport.primaryModel}`);
  }
  console.log('  -> PASS: Subsequent request immediately routed to secondary fallback model without calling primary.');
  passed++;

  // --------------------------------------------------------------------------
  // TEST 5: Cascading to Sovereign Edge Brain when secondary also hits COOLDOWN
  // --------------------------------------------------------------------------
  console.log('\n[TEST 5] Verifying cascade to Sovereign Edge Brain when both cloud models in COOLDOWN...');
  router.recordFailure(secondaryId, new Error('RESOURCE_EXHAUSTED: 429 quota'), 429);

  const secDesc = router.getModelDescriptors().find((m) => m.id === secondaryId);
  if (secDesc?.status !== 'COOLDOWN') {
    throw new Error(`TEST 5 FAILED: Expected secondary in COOLDOWN, got ${secDesc?.status}`);
  }

  invokedModels = [];
  const edgeResult = await router.routeAndExecute({
    prompt: 'System status report',
    language: 'en',
  });

  if (invokedModels.length > 0) {
    throw new Error(`TEST 5 FAILED: Cloud backend was invoked while both models in COOLDOWN: ${invokedModels.join(', ')}`);
  }
  if (edgeResult.engineMode !== 'SOVEREIGN_EDGE_BRAIN' || edgeResult.modelTier !== 4) {
    throw new Error(`TEST 5 FAILED: Expected SOVEREIGN_EDGE_BRAIN tier 4, got ${edgeResult.engineMode}`);
  }
  console.log('  -> PASS: When both primary and secondary are in COOLDOWN, immediately routes to Sovereign Edge Brain.');
  passed++;

  // --------------------------------------------------------------------------
  // TEST 6: HALF_OPEN canary probing after cooldown expiration and recovery
  // --------------------------------------------------------------------------
  console.log('\n[TEST 6] Verifying HALF_OPEN canary probe after cooldown expiration and recovery to ONLINE...');
  // Manually trip with a short 20ms cooldown
  router.tripCircuitBreaker(primaryId, 20, 'Test short cooldown');
  await new Promise((resolve) => setTimeout(resolve, 35));

  const stateAfterExpiry = router.getCircuitBreakerState(primaryId);
  if (stateAfterExpiry !== 'HALF_OPEN') {
    throw new Error(`TEST 6 FAILED: Expected HALF_OPEN state after expiry, got ${stateAfterExpiry}`);
  }

  const primaryAfterExpiry = router.getModelDescriptors().find((m) => m.id === primaryId)!;
  const isCallableAfterExpiry = router.isModelCallable(primaryAfterExpiry);
  if (!isCallableAfterExpiry) {
    throw new Error('TEST 6 FAILED: Model should be callable in HALF_OPEN for canary probe');
  }

  // Record successful canary response
  router.recordSuccess(primaryId, 45);

  const restoredMetrics = router.getCircuitBreakerMetrics(primaryId);
  const restoredDesc = router.getModelDescriptors().find((m) => m.id === primaryId)!;

  if (restoredMetrics.state !== 'CLOSED' || restoredDesc.status !== 'ONLINE') {
    throw new Error(`TEST 6 FAILED: Expected CLOSED and ONLINE, got state=${restoredMetrics.state}, status=${restoredDesc.status}`);
  }
  if (restoredMetrics.consecutive429Count !== 0) {
    throw new Error(`TEST 6 FAILED: Expected consecutive429Count reset to 0, got ${restoredMetrics.consecutive429Count}`);
  }
  console.log('  -> PASS: Cooldown expiration transitioned to HALF_OPEN; canary success restored model to ONLINE (CLOSED).');
  passed++;

  // --------------------------------------------------------------------------
  // TEST 7: Per-model custom cooldown override
  // --------------------------------------------------------------------------
  console.log('\n[TEST 7] Verifying per-model configurable cooldown override...');
  router.setModelCooldownDuration('gemini-2.5-flash', 120000);
  if (router.getCooldownDuration('gemini-2.5-flash') !== 120000) {
    throw new Error(`TEST 7 FAILED: Expected 120000ms for secondary, got ${router.getCooldownDuration('gemini-2.5-flash')}`);
  }
  // Global should still be 45000ms
  if (router.getCooldownDuration('gemini-3.8-flash') !== 45000) {
    throw new Error(`TEST 7 FAILED: Expected 45000ms for primary, got ${router.getCooldownDuration('gemini-3.8-flash')}`);
  }
  console.log('  -> PASS: Per-model custom cooldown override applies independently.');
  passed++;

  // --------------------------------------------------------------------------
  // SUMMARY
  // --------------------------------------------------------------------------
  console.log('\n================================================================');
  console.log(` ALL ${passed}/${total} CIRCUIT BREAKER TESTS PASSED SUCCESSFULLY!`);
  console.log('================================================================\n');
}

runCircuitBreakerTests().catch((err) => {
  console.error('FATAL TEST ERROR:', err);
  process.exit(1);
});
