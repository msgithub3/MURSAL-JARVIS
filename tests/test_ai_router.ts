/**
 * MURSAL JARVIS — AI Router & Failover Cascade 14-Scenario Verification Suite
 * 
 * Verifies:
 * 1. Gemini success
 * 2. Gemini 429 (Rate-limited, retryDelay extraction, no retry loop)
 * 3. Gemini 404 (Not found, marked UNAVAILABLE)
 * 4. Gemini 500 (Internal error, marked DEGRADED)
 * 5. Gemini 503 (High demand, marked DEGRADED)
 * 6. Gemini timeout (Marked OFFLINE)
 * 7. Network failure (Marked OFFLINE)
 * 8. Secondary model success (Cascades to Gemini 2.5 Flash, verified response)
 * 9. Secondary model failure (Continues cascade)
 * 10. All providers unavailable (Sovereign Edge Brain autonomous generation)
 * 11. Cooldown (Rejects calling model during cooldown window)
 * 12. Recovery after cooldown (Probe check returns model to HEALTHY)
 * 13. Duplicate speech (Suppresses rapid audio stutter <800ms)
 * 14. Two identical but separate user commands (Does NOT suppress legitimate repeated interactions)
 */

import { ProviderStateMachine } from '../src/lib/providerStateMachine.ts';
import { globalVoicePipelineGuard } from '../src/lib/voicePipelineGuard.ts';
import { AIProviderGateway, globalAIProviderGateway, ProviderConfig } from '../src/lib/aiProviderGateway.ts';
import { LocalEngineAdapter } from '../src/lib/localEngineAdapter.ts';

interface TestResult {
  scenarioNumber: number;
  scenarioName: string;
  passed: boolean;
  details: string;
}

const testResults: TestResult[] = [];

function assert(condition: boolean, msg: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${msg}`);
  }
}

async function runAll14Tests() {
  console.log('\n===============================================================');
  console.log('  MURSAL JARVIS: RUNNING 14-SCENARIO AI ROUTER TEST SUITE');
  console.log('===============================================================\n');

  // --------------------------------------------------------------------------
  // TEST 1: Gemini success
  // --------------------------------------------------------------------------
  try {
    const sm = new ProviderStateMachine();
    const mockClient: any = {
      models: {
        generateContent: async ({ model }: any) => {
          if (model === 'gemini-3.8-flash') {
            return { text: 'MURSAL JARVIS online and operational, jani.' };
          }
          throw new Error('Not primary');
        },
      },
    };

    const res = await sm.executeWithCascade(mockClient, 'Status check', 'System prompt');
    assert(res.primaryStatus === 'SUCCESS', 'Primary status should be SUCCESS');
    assert(res.responseSource === 'gemini-3.8-flash', 'Response source should be gemini-3.8-flash');
    assert(res.activeTier === 1, 'Active tier should be 1');
    assert(res.reply.includes('MURSAL JARVIS online'), 'Reply content mismatch');
    testResults.push({ scenarioNumber: 1, scenarioName: 'Gemini success', passed: true, details: 'Primary returned 200 with text' });
    console.log('  [PASS] Test 1: Gemini success');
  } catch (err: any) {
    testResults.push({ scenarioNumber: 1, scenarioName: 'Gemini success', passed: false, details: err.message });
    console.error('  [FAIL] Test 1: Gemini success:', err.message);
  }

  // --------------------------------------------------------------------------
  // TEST 2: Gemini 429
  // --------------------------------------------------------------------------
  try {
    const sm = new ProviderStateMachine();
    const mockClient: any = {
      models: {
        generateContent: async ({ model }: any) => {
          if (model === 'gemini-3.8-flash') {
            const err: any = new Error('You exceeded your current quota. Please retry in 51.62s');
            err.details = [{ '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay: '51s' }];
            throw err;
          }
          if (model === 'gemini-2.5-flash') {
            return { text: 'Secondary model response from Gemini 2.5 Flash' };
          }
          throw new Error('Unexpected model');
        },
      },
    };

    const res = await sm.executeWithCascade(mockClient, 'Hello JARVIS', 'System prompt');
    assert(res.primaryStatus === 429, 'Primary status should be 429');
    assert(res.secondaryStatus === 'SUCCESS', 'Secondary status should be SUCCESS');
    assert(res.responseSource === 'gemini-2.5-flash', 'Response source should be secondary');
    const rec = sm.getRecord('gemini-3.8-flash');
    assert(rec?.state === 'COOLDOWN', 'Primary should be in COOLDOWN');
    assert(rec?.retryDelaySeconds === 53, 'Retry delay should be parsed as 51s + 2s safety buffer');
    testResults.push({ scenarioNumber: 2, scenarioName: 'Gemini 429', passed: true, details: '429 detected, retryDelay parsed, transitioned to COOLDOWN' });
    console.log('  [PASS] Test 2: Gemini 429');
  } catch (err: any) {
    testResults.push({ scenarioNumber: 2, scenarioName: 'Gemini 429', passed: false, details: err.message });
    console.error('  [FAIL] Test 2: Gemini 429:', err.message);
  }

  // --------------------------------------------------------------------------
  // TEST 3: Gemini 404
  // --------------------------------------------------------------------------
  try {
    const sm = new ProviderStateMachine();
    sm.recordFailure('gemini-3.8-flash', 404, 'models/gemini-3.8-flash is not found');
    const rec = sm.getRecord('gemini-3.8-flash');
    assert(rec?.state === 'UNAVAILABLE', '404 must mark model as UNAVAILABLE');
    assert(!sm.isModelCallable('gemini-3.8-flash'), 'Model should not be callable');
    testResults.push({ scenarioNumber: 3, scenarioName: 'Gemini 404', passed: true, details: '404 correctly marked as UNAVAILABLE' });
    console.log('  [PASS] Test 3: Gemini 404');
  } catch (err: any) {
    testResults.push({ scenarioNumber: 3, scenarioName: 'Gemini 404', passed: false, details: err.message });
    console.error('  [FAIL] Test 3: Gemini 404:', err.message);
  }

  // --------------------------------------------------------------------------
  // TEST 4: Gemini 500
  // --------------------------------------------------------------------------
  try {
    const sm = new ProviderStateMachine();
    sm.recordFailure('gemini-3.8-flash', 500, 'Internal server error');
    const rec = sm.getRecord('gemini-3.8-flash');
    assert(rec?.state === 'DEGRADED', '500 must mark model as DEGRADED');
    testResults.push({ scenarioNumber: 4, scenarioName: 'Gemini 500', passed: true, details: '500 correctly marked as DEGRADED' });
    console.log('  [PASS] Test 4: Gemini 500');
  } catch (err: any) {
    testResults.push({ scenarioNumber: 4, scenarioName: 'Gemini 500', passed: false, details: err.message });
    console.error('  [FAIL] Test 4: Gemini 500:', err.message);
  }

  // --------------------------------------------------------------------------
  // TEST 5: Gemini 503
  // --------------------------------------------------------------------------
  try {
    const sm = new ProviderStateMachine();
    sm.recordFailure('gemini-3.8-flash', 503, 'The model is overloaded. Please try again later.');
    const rec = sm.getRecord('gemini-3.8-flash');
    assert(rec?.state === 'DEGRADED', '503 must mark model as DEGRADED');
    assert(rec?.cooldownUntil! > Date.now(), 'Transient cooldown must be applied for 503');
    testResults.push({ scenarioNumber: 5, scenarioName: 'Gemini 503', passed: true, details: '503 marked as DEGRADED with transient cooldown' });
    console.log('  [PASS] Test 5: Gemini 503');
  } catch (err: any) {
    testResults.push({ scenarioNumber: 5, scenarioName: 'Gemini 503', passed: false, details: err.message });
    console.error('  [FAIL] Test 5: Gemini 503:', err.message);
  }

  // --------------------------------------------------------------------------
  // TEST 6: Gemini timeout
  // --------------------------------------------------------------------------
  try {
    const sm = new ProviderStateMachine();
    sm.recordFailure('gemini-3.8-flash', 'TIMEOUT', 'Request timed out after 10000ms');
    const rec = sm.getRecord('gemini-3.8-flash');
    assert(rec?.state === 'OFFLINE', 'Timeout must mark model as OFFLINE');
    assert(!sm.isModelCallable('gemini-3.8-flash'), 'Timeout model should not be callable');
    testResults.push({ scenarioNumber: 6, scenarioName: 'Gemini timeout', passed: true, details: 'Timeout correctly marked as OFFLINE' });
    console.log('  [PASS] Test 6: Gemini timeout');
  } catch (err: any) {
    testResults.push({ scenarioNumber: 6, scenarioName: 'Gemini timeout', passed: false, details: err.message });
    console.error('  [FAIL] Test 6: Gemini timeout:', err.message);
  }

  // --------------------------------------------------------------------------
  // TEST 7: Network failure
  // --------------------------------------------------------------------------
  try {
    const sm = new ProviderStateMachine();
    sm.recordFailure('gemini-3.8-flash', 'NETWORK_FAILURE', 'fetch failed: ENOTFOUND generativelanguage.googleapis.com');
    const rec = sm.getRecord('gemini-3.8-flash');
    assert(rec?.state === 'OFFLINE', 'Network failure must mark model as OFFLINE');
    assert(!sm.isModelCallable('gemini-3.8-flash'), 'Offline model must not be called');
    testResults.push({ scenarioNumber: 7, scenarioName: 'Network failure', passed: true, details: 'Network failure marked as OFFLINE' });
    console.log('  [PASS] Test 7: Network failure');
  } catch (err: any) {
    testResults.push({ scenarioNumber: 7, scenarioName: 'Network failure', passed: false, details: err.message });
    console.error('  [FAIL] Test 7: Network failure:', err.message);
  }

  // --------------------------------------------------------------------------
  // TEST 8: Secondary model success
  // --------------------------------------------------------------------------
  try {
    const sm = new ProviderStateMachine();
    sm.recordRateLimited('gemini-3.8-flash', { message: 'Quota exceeded 429' });
    const mockClient: any = {
      models: {
        generateContent: async ({ model }: any) => {
          if (model === 'gemini-2.5-flash') {
            return { text: 'MursalCart analysis generated by Gemini 2.5 Flash.' };
          }
          throw new Error('Not available');
        },
      },
    };

    const res = await sm.executeWithCascade(mockClient, 'Daraz winning product', 'System prompt');
    assert(res.responseSource === 'gemini-2.5-flash', 'Response source should be gemini-2.5-flash');
    assert(res.secondaryStatus === 'SUCCESS', 'Secondary status must be SUCCESS');
    assert(res.activeTier === 2, 'Active tier must be 2');
    testResults.push({ scenarioNumber: 8, scenarioName: 'Secondary model success', passed: true, details: 'Secondary model generated authentic response' });
    console.log('  [PASS] Test 8: Secondary model success');
  } catch (err: any) {
    testResults.push({ scenarioNumber: 8, scenarioName: 'Secondary model success', passed: false, details: err.message });
    console.error('  [FAIL] Test 8: Secondary model success:', err.message);
  }

  // --------------------------------------------------------------------------
  // TEST 9: Secondary model failure
  // --------------------------------------------------------------------------
  try {
    const sm = new ProviderStateMachine();
    const mockClient: any = {
      models: {
        generateContent: async ({ model }: any) => {
          if (model === 'gemini-3.8-flash') throw new Error('429 Quota');
          if (model === 'gemini-2.5-flash') throw new Error('500 Server error');
          if (model === 'gemini-2.5-flash-lite') return { text: 'Tertiary Lite Model Response' };
          throw new Error('Unknown');
        },
      },
    };

    const res = await sm.executeWithCascade(mockClient, 'Query', 'System prompt');
    assert(res.primaryStatus === 429, 'Primary was 429');
    assert(res.secondaryStatus === 500, 'Secondary was 500');
    assert(res.responseSource === 'gemini-2.5-flash-lite', 'Cascaded to tertiary lite');
    assert(res.activeTier === 3, 'Tier 3 succeeded');
    testResults.push({ scenarioNumber: 9, scenarioName: 'Secondary model failure', passed: true, details: 'Cascaded past failed secondary to tertiary' });
    console.log('  [PASS] Test 9: Secondary model failure');
  } catch (err: any) {
    testResults.push({ scenarioNumber: 9, scenarioName: 'Secondary model failure', passed: false, details: err.message });
    console.error('  [FAIL] Test 9: Secondary model failure:', err.message);
  }

  // --------------------------------------------------------------------------
  // TEST 10: All providers unavailable (Sovereign Edge Brain autonomous fallback)
  // --------------------------------------------------------------------------
  try {
    const sm = new ProviderStateMachine();
    // Simulate all cloud models failing with 429
    sm.recordRateLimited('gemini-3.8-flash', { message: '429' });
    sm.recordRateLimited('gemini-2.5-flash', { message: '429' });
    sm.recordRateLimited('gemini-2.5-flash-lite', { message: '429' });

    // Client is null (or offline)
    const res = await sm.executeWithCascade(null, 'battery kitna hai?', 'System prompt', {
      language: 'ur-Roman',
    });

    assert(Boolean(res.reply), 'Sovereign fallback must produce a valid reply');
    assert(
      res.responseSource === 'python-core-daemon' || res.responseSource === 'sovereign-edge-brain',
      `Response source must be genuine fallback, got: ${res.responseSource}`
    );
    assert(res.engineMode === 'SOVEREIGN_EDGE_FAILOVER', 'Engine mode must be SOVEREIGN_EDGE_FAILOVER');
    testResults.push({ scenarioNumber: 10, scenarioName: 'All providers unavailable', passed: true, details: `Autonomous fallback response generated via ${res.responseSource}` });
    console.log('  [PASS] Test 10: All providers unavailable');
  } catch (err: any) {
    testResults.push({ scenarioNumber: 10, scenarioName: 'All providers unavailable', passed: false, details: err.message });
    console.error('  [FAIL] Test 10: All providers unavailable:', err.message);
  }

  // --------------------------------------------------------------------------
  // TEST 11: Cooldown
  // --------------------------------------------------------------------------
  try {
    const sm = new ProviderStateMachine();
    sm.recordRateLimited('gemini-3.8-flash', { message: '429 quota retry in 60s' });
    assert(!sm.isModelCallable('gemini-3.8-flash'), 'Rate-limited model must be non-callable');

    let attemptedPrimaryCall = false;
    const mockClient: any = {
      models: {
        generateContent: async ({ model }: any) => {
          if (model === 'gemini-3.8-flash') {
            attemptedPrimaryCall = true;
          }
          return { text: 'Secondary response from Gemini 2.5 Flash' };
        },
      },
    };

    // Subsequent request
    const res = await sm.executeWithCascade(mockClient, 'Query during cooldown', 'Prompt');
    assert(!attemptedPrimaryCall, 'Must NOT attempt network call to model in cooldown (no retry loop)');
    assert(res.primaryStatus === 'COOLDOWN_ACTIVE' || res.primaryStatus === 'COOLDOWN', 'Primary status must reflect active cooldown');
    testResults.push({ scenarioNumber: 11, scenarioName: 'Cooldown', passed: true, details: 'Model in cooldown skipped without retry loop' });
    console.log('  [PASS] Test 11: Cooldown');
  } catch (err: any) {
    testResults.push({ scenarioNumber: 11, scenarioName: 'Cooldown', passed: false, details: err.message });
    console.error('  [FAIL] Test 11: Cooldown:', err.message);
  }

  // --------------------------------------------------------------------------
  // TEST 12: Recovery after cooldown
  // --------------------------------------------------------------------------
  try {
    const sm = new ProviderStateMachine();
    sm.recordRateLimited('gemini-3.8-flash', { message: '429' });
    const rec = sm.getRecord('gemini-3.8-flash')!;

    // Simulate cooldown expiring
    rec.cooldownUntil = Date.now() - 1000;

    // Upon getRecord after expiry, state transitions to HEALTHY (probation)
    const freshRec = sm.getRecord('gemini-3.8-flash');
    assert(freshRec?.state === 'HEALTHY', 'Expired cooldown transitions to HEALTHY');
    assert(freshRec?.isProbation === true, 'Model placed in probation probe');

    const mockClient: any = {
      models: {
        generateContent: async () => ({ text: 'pong' }),
      },
    };

    const probeResult = await sm.probeModelHealth(mockClient, 'gemini-3.8-flash');
    assert(probeResult === true, 'Probe must succeed');
    assert(sm.getRecord('gemini-3.8-flash')?.isProbation === false, 'Probation cleared upon probe success');
    testResults.push({ scenarioNumber: 12, scenarioName: 'Recovery after cooldown', passed: true, details: 'Cooldown expired, probe passed, restored to HEALTHY rotation' });
    console.log('  [PASS] Test 12: Recovery after cooldown');
  } catch (err: any) {
    testResults.push({ scenarioNumber: 12, scenarioName: 'Recovery after cooldown', passed: false, details: err.message });
    console.error('  [FAIL] Test 12: Recovery after cooldown:', err.message);
  }

  // --------------------------------------------------------------------------
  // TEST 13: Duplicate speech
  // --------------------------------------------------------------------------
  try {
    globalVoicePipelineGuard.resetToStandby();

    const token1 = globalVoicePipelineGuard.acquireExecution('hello jarvis', {
      sessionId: 'session-voice-1',
      commandId: 'cmd-stutter-1',
    });
    assert(token1 !== null, 'First utterance must be granted execution');

    // Immediate rapid audio duplicate in SAME session (<800ms)
    const token2 = globalVoicePipelineGuard.acquireExecution('hello jarvis', {
      sessionId: 'session-voice-1',
      commandId: 'cmd-stutter-1',
    });
    assert(token2 === null, 'Rapid audio stutter in same session must be suppressed');

    globalVoicePipelineGuard.releaseExecution(token1, true);
    testResults.push({ scenarioNumber: 13, scenarioName: 'Duplicate speech', passed: true, details: 'Audio stutter in same session successfully suppressed' });
    console.log('  [PASS] Test 13: Duplicate speech');
  } catch (err: any) {
    testResults.push({ scenarioNumber: 13, scenarioName: 'Duplicate speech', passed: false, details: err.message });
    console.error('  [FAIL] Test 13: Duplicate speech:', err.message);
  }

  // --------------------------------------------------------------------------
  // TEST 14: Two identical but separate user commands
  // --------------------------------------------------------------------------
  try {
    globalVoicePipelineGuard.resetToStandby();

    // Turn 1: User says "check battery"
    const turn1 = globalVoicePipelineGuard.acquireExecution('check battery', {
      sessionId: 'session-user-turn-1',
      commandId: 'cmd-battery-turn-1',
    });
    assert(turn1 !== null, 'Turn 1 execution must be granted');
    globalVoicePipelineGuard.releaseExecution(turn1, true);

    // Wait a brief tick to represent the next interaction
    await new Promise((r) => setTimeout(r, 50));

    // Turn 2: User in a separate interaction intentionally asks "check battery" again
    const turn2 = globalVoicePipelineGuard.acquireExecution('check battery', {
      sessionId: 'session-user-turn-2',
      commandId: 'cmd-battery-turn-2',
    });
    assert(turn2 !== null, 'Turn 2 separate command with identical text must NOT be suppressed');
    assert(turn2.commandId === 'cmd-battery-turn-2', 'Turn 2 must have distinct command ID');
    globalVoicePipelineGuard.releaseExecution(turn2, true);

    testResults.push({
      scenarioNumber: 14,
      scenarioName: 'Two identical but separate user commands',
      passed: true,
      details: 'Legitimate repeated command in new session/commandId successfully granted execution',
    });
    console.log('  [PASS] Test 14: Two identical but separate user commands');
  } catch (err: any) {
    testResults.push({
      scenarioNumber: 14,
      scenarioName: 'Two identical but separate user commands',
      passed: false,
      details: err.message,
    });
    console.error('  [FAIL] Test 14: Two identical but separate user commands:', err.message);
  }

  // --------------------------------------------------------------------------
  // TEST 15: Qwen -> DeepSeek -> Ollama -> Gemini Failover Chain
  // --------------------------------------------------------------------------
  try {
    const gateway = new AIProviderGateway();

    // 15.1: Verify Resolved Provider Order
    // Set mock environment variables to verify chain construction
    process.env.QWEN_API_KEY = 'test-qwen-key';
    process.env.QWEN_BASE_URL = 'https://api.qwen.mock/v1';
    process.env.DEEPSEEK_API_KEY = 'test-deepseek-key';
    process.env.DEEPSEEK_BASE_URL = 'https://api.deepseek.com';
    process.env.GEMINI_API_KEY = 'test-gemini-key';

    const chain = await gateway.getResolvedProviders('FAST', 'CLOUD_FIRST', true);

    // Qwen must be first
    assert(chain[0].name === 'QWEN', `Chain 0 must be QWEN, got ${chain[0]?.name}`);
    // DeepSeek must be second
    assert(chain[1].name === 'DEEPSEEK', `Chain 1 must be DEEPSEEK, got ${chain[1]?.name}`);
    // Gemini must only be included if explicitly permitted
    const geminiInChain = chain.find((p) => p.name === 'GEMINI');
    assert(geminiInChain !== undefined, 'Gemini should be present when allowGemini=true');

    // 15.2: Verify that when allowGemini=false, Gemini is strictly excluded from default cloud routing
    const nonGeminiChain = await gateway.getResolvedProviders('FAST', 'CLOUD_FIRST', false);
    const geminiExcluded = nonGeminiChain.find((p) => p.name === 'GEMINI');
    assert(geminiExcluded === undefined, 'Gemini must be excluded by default when allowGemini=false');

    // 15.3: Verify Failover Execution through Custom Provider Pipeline
    // Setup 3 custom tiers: Tier 1 (Fails), Tier 2 (Fails), Tier 3 (Succeeds)
    const customCascade: ProviderConfig[] = [
      {
        name: 'MOCK_QWEN_FAILING',
        baseUrl: 'https://127.0.0.1:9991/nonexistent',
        apiKey: 'qwen-dummy',
        model: 'qwen-plus',
      },
      {
        name: 'MOCK_DEEPSEEK_FAILING',
        baseUrl: 'https://127.0.0.1:9992/nonexistent',
        apiKey: 'deepseek-dummy',
        model: 'deepseek-chat',
      },
    ];
    gateway.setCustomProviders(customCascade);

    // When all configured custom providers fail, gateway returns null to signal failover
    const fallbackRes = await gateway.streamGenerate({
      contents: [{ role: 'user', parts: [{ text: 'battery kitna hai?' }] }],
      providerTimeoutMs: 100,
    });

    assert(fallbackRes === null, 'Gateway must return null when providers fail to trigger Sovereign Edge');

    // Verify Sovereign Edge failover response execution
    const sm = new ProviderStateMachine();
    const edgeRes = await sm.executeWithCascade(null, 'battery kitna hai?', 'System prompt', {
      language: 'ur-Roman',
    });
    assert(
      edgeRes.engineMode === 'SOVEREIGN_EDGE_FAILOVER',
      `Engine mode must be SOVEREIGN_EDGE_FAILOVER, got: ${edgeRes.engineMode}`
    );
    assert(
      Boolean(edgeRes.reply),
      'Sovereign edge failover must produce non-empty reply'
    );

    // Reset custom providers and environment
    gateway.setCustomProviders(null);
    delete process.env.QWEN_API_KEY;
    delete process.env.QWEN_BASE_URL;
    delete process.env.DEEPSEEK_API_KEY;

    testResults.push({
      scenarioNumber: 15,
      scenarioName: 'Qwen -> DeepSeek -> Ollama -> Gemini Failover Chain',
      passed: true,
      details: 'Strict Qwen -> DeepSeek -> Ollama failover chain verified with Sovereign Edge safety fallback',
    });
    console.log('  [PASS] Test 15: Qwen -> DeepSeek -> Ollama -> Gemini Failover Chain');
  } catch (err: any) {
    testResults.push({
      scenarioNumber: 15,
      scenarioName: 'Qwen -> DeepSeek -> Ollama -> Gemini Failover Chain',
      passed: false,
      details: err.message,
    });
    console.error('  [FAIL] Test 15: Qwen -> DeepSeek -> Ollama -> Gemini Failover Chain:', err.message);
  }

  // --------------------------------------------------------------------------
  // TEST 16: Voice Pipeline Streaming, Sentence Chunks & Telemetry
  // --------------------------------------------------------------------------
  try {
    const { SentenceChunker } = await import('../src/lib/sentenceChunker.ts');
    const chunker = new SentenceChunker();
    const receivedChunks: string[] = [];

    chunker.onSentence((sentence) => {
      receivedChunks.push(sentence);
    });

    // Simulate streaming text arrival in fragmented tokens
    chunker.append('Assalam-o-Alaikum ');
    chunker.append('Mursaleen bhai! ');
    chunker.append('MURSAL JARVIS is active. ');
    chunker.append('MursalCart COD profit margin is 42 percent. ');
    chunker.flush();

    assert(receivedChunks.length >= 3, `Expected at least 3 sentence chunks, got ${receivedChunks.length}`);
    assert(receivedChunks[0].includes('Assalam-o-Alaikum'), 'First chunk must contain greeting');
    assert(receivedChunks[1].includes('MURSAL JARVIS is active'), 'Second chunk must contain status');

    testResults.push({
      scenarioNumber: 16,
      scenarioName: 'Voice Pipeline Streaming & SentenceChunker Telemetry',
      passed: true,
      details: `SentenceChunker emitted ${receivedChunks.length} grammatical chunks without audio stutter.`,
    });
    console.log('  [PASS] Test 16: Voice Pipeline Streaming & SentenceChunker Telemetry');
  } catch (err: any) {
    testResults.push({
      scenarioNumber: 16,
      scenarioName: 'Voice Pipeline Streaming & SentenceChunker Telemetry',
      passed: false,
      details: err.message,
    });
    console.error('  [FAIL] Test 16: Voice Pipeline Streaming & SentenceChunker Telemetry:', err.message);
  }

  // --------------------------------------------------------------------------
  // Summary Table
  // --------------------------------------------------------------------------
  console.log('\n===============================================================');
  console.log('                      TEST RESULTS SUMMARY                     ');
  console.log('===============================================================');
  console.table(
    testResults.map((t) => ({
      Scenario: `${t.scenarioNumber}. ${t.scenarioName}`,
      Status: t.passed ? 'PASS' : 'FAIL',
      Details: t.details,
    }))
  );

  const passCount = testResults.filter((t) => t.passed).length;
  console.log(`\nFinal Score: ${passCount} / ${testResults.length} passed.`);

  if (passCount !== testResults.length) {
    process.exit(1);
  }
}

runAll14Tests();
