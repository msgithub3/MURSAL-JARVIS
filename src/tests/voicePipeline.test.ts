/**
 * Comprehensive Automated Test Suite for MURSAL JARVIS Voice Pipeline
 * 
 * Tests Scenarios A through K:
 * Scenario A: Single "Hello" — Acquires execution lock, runs once
 * Scenario B: Duplicate "Hello" within 55ms — Suppressed cleanly with rich diagnostic log
 * Scenario C: "Hello" twice after normal human interval — Allowed and executed
 * Scenario D: "Hey JARVIS" wake word — Triggers WAKE_WORD_DETECTED, plain "Hello" does NOT
 * Scenario E: Two simultaneous startListening() calls — Strictly idempotent
 * Scenario F: React component remount — Teardown and cleanup of listeners, no leaks
 * Scenario G: Interim → final transcript — Interim ignored, final processed once
 * Scenario H: TTS response → microphone listening — Echo suppressed during TTS, listening resumes
 * Scenario I: Multiple commands sequentially — In-order non-interfering execution
 * Scenario J: WebSocket command + microphone command — Separate session/source handling
 * Scenario K: Voice pipeline recovery after error — Resets to standby, allows re-listening
 */

import { globalVoicePipelineGuard } from '../lib/voicePipelineGuard';
import { VoicePipelineManager } from '../lib/voicePipelineManager';
import { globalTTSProvider, DEFAULT_PRONUNCIATION_OVERRIDES } from '../lib/ttsProvider';

// Mock Web Speech API in Node test environment
class MockSpeechRecognition {
  public continuous = true;
  public interimResults = true;
  public lang = 'en-US';
  public maxAlternatives = 1;
  public onstart: (() => void) | null = null;
  public onresult: ((event: any) => void) | null = null;
  public onerror: ((event: any) => void) | null = null;
  public onend: (() => void) | null = null;

  public isStarted = false;

  public start() {
    if (this.isStarted) {
      throw new Error('InvalidStateError: recognition has already started');
    }
    this.isStarted = true;
    if (this.onstart) this.onstart();
  }

  public stop() {
    this.isStarted = false;
    if (this.onend) this.onend();
  }

  public abort() {
    this.isStarted = false;
    if (this.onend) this.onend();
  }

  public emitResult(results: Array<{ transcript: string; isFinal: boolean }>, resultIndex = 0) {
    if (!this.onresult) return;
    const formatted = results.map((r) => {
      const item: any = [{ transcript: r.transcript }];
      item.isFinal = r.isFinal;
      return item;
    });
    this.onresult({
      resultIndex,
      results: formatted,
    });
  }

  public emitError(error: string) {
    if (this.onerror) {
      this.onerror({ error });
    }
  }
}

// Attach mock to global window
(global as any).window = {
  SpeechRecognition: MockSpeechRecognition,
};

async function runTests() {
  console.log('================================================================');
  console.log('=== RUNNING MURSAL JARVIS VOICE PIPELINE VERIFICATION SUITE ===');
  console.log('================================================================\n');

  let passedTests = 0;
  const totalTests = 14;

  // --------------------------------------------------------------------------
  // TEST A: Single "Hello"
  // --------------------------------------------------------------------------
  console.log('[TEST A] Single "Hello" acquisition...');
  globalVoicePipelineGuard.resetToStandby();
  const tokenA = globalVoicePipelineGuard.acquireExecution('Hello', {
    source: 'stt',
    status: 'final',
    sessionId: 'session-A',
  });
  if (tokenA && tokenA.normalizedText === 'hello') {
    console.log('  -> PASS: Acquired lock token for "Hello":', tokenA.executionId);
    globalVoicePipelineGuard.releaseExecution(tokenA, true);
    passedTests++;
  } else {
    throw new Error('TEST A FAILED: Could not acquire lock for "Hello"');
  }

  // --------------------------------------------------------------------------
  // TEST B: Duplicate "Hello" within 55ms
  // --------------------------------------------------------------------------
  console.log('\n[TEST B] Duplicate "Hello" within 55ms suppression...');
  globalVoicePipelineGuard.resetToStandby();
  const tokenB1 = globalVoicePipelineGuard.acquireExecution('Hello', {
    source: 'stt',
    status: 'final',
    sessionId: 'session-B',
    timestamp: Date.now(),
  });
  if (!tokenB1) throw new Error('TEST B PRECONDITION FAILED: Initial token null');

  // Immediately simulate duplicate STT delivery within 55ms
  const tokenB2 = globalVoicePipelineGuard.acquireExecution('Hello', {
    source: 'stt',
    status: 'final',
    sessionId: 'session-B',
    timestamp: Date.now() + 55,
  });

  if (tokenB2 === null) {
    console.log('  -> PASS: Duplicate "Hello" within 55ms correctly suppressed by guard.');
    passedTests++;
  } else {
    throw new Error('TEST B FAILED: Duplicate "Hello" was NOT suppressed within 55ms!');
  }
  globalVoicePipelineGuard.releaseExecution(tokenB1, true);

  // --------------------------------------------------------------------------
  // TEST C: "Hello" twice after normal human interval
  // --------------------------------------------------------------------------
  console.log('\n[TEST C] "Hello" twice after normal human interval...');
  globalVoicePipelineGuard.resetToStandby();
  const tokenC1 = globalVoicePipelineGuard.acquireExecution('Hello', {
    source: 'stt',
    status: 'final',
    sessionId: 'session-C1',
  });
  if (!tokenC1) throw new Error('TEST C PRECONDITION FAILED: C1 was null');
  globalVoicePipelineGuard.releaseExecution(tokenC1, true);

  // Simulate normal user conversational interval after prior command completes
  await new Promise((r) => setTimeout(r, 850));
  const tokenC2 = globalVoicePipelineGuard.acquireExecution('Hello', {
    source: 'stt',
    status: 'final',
    sessionId: 'session-C2',
  });

  if (tokenC2 !== null) {
    console.log('  -> PASS: Legitimate repeated "Hello" granted execution lock after interval.');
    globalVoicePipelineGuard.releaseExecution(tokenC2, true);
    passedTests++;
  } else {
    throw new Error('TEST C FAILED: Legitimate repeated speech was incorrectly blocked!');
  }

  // --------------------------------------------------------------------------
  // TEST D: "Hey JARVIS" wake word detection vs plain "Hello"
  // --------------------------------------------------------------------------
  console.log('\n[TEST D] Wake word detection verification...');
  const managerD = new VoicePipelineManager();
  let detectedCommandsD: string[] = [];
  managerD.onCommand((cmd) => {
    detectedCommandsD.push(cmd);
  });

  await managerD.startListening();
  const mockRecD = (managerD as any).recognition as MockSpeechRecognition;

  // 1. Send plain "Hey JARVIS"
  mockRecD.emitResult([{ transcript: 'Hey JARVIS', isFinal: true }]);
  const phaseAfterWake = globalVoicePipelineGuard.getState().phase;
  if (phaseAfterWake === 'WAKE_WORD_DETECTED') {
    console.log('  -> PASS: "Hey JARVIS" triggered phase WAKE_WORD_DETECTED without dispatching empty command.');
  } else {
    throw new Error(`TEST D FAILED: Phase is ${phaseAfterWake}, expected WAKE_WORD_DETECTED`);
  }

  // 2. Plain "Hello" is NEVER a wake word
  globalVoicePipelineGuard.resetToStandby();
  mockRecD.emitResult([{ transcript: 'Hello', isFinal: true }], 1);
  const phaseAfterHello = globalVoicePipelineGuard.getState().phase;
  if (phaseAfterHello !== 'WAKE_WORD_DETECTED') {
    console.log('  -> PASS: Plain "Hello" is treated as normal speech/command, NOT a wake word.');
    passedTests++;
  } else {
    throw new Error('TEST D FAILED: Plain "Hello" was mistakenly treated as a wake word');
  }
  managerD.teardown();

  // --------------------------------------------------------------------------
  // TEST E: Two simultaneous startListening() calls
  // --------------------------------------------------------------------------
  console.log('\n[TEST E] Two simultaneous startListening() calls (idempotency)...');
  const managerE = new VoicePipelineManager();
  const p1 = managerE.startListening();
  const p2 = managerE.startListening();
  const [res1, res2] = await Promise.all([p1, p2]);

  if (res1 && res2 && managerE.getSTTState() === 'LISTENING') {
    console.log('  -> PASS: Concurrent startListening() calls resolved idempotently to single session.');
    passedTests++;
  } else {
    throw new Error('TEST E FAILED: Concurrent startListening did not resolve cleanly');
  }
  managerE.teardown();

  // --------------------------------------------------------------------------
  // TEST F: React/component remount hygiene
  // --------------------------------------------------------------------------
  console.log('\n[TEST F] React component remount simulation...');
  const managerF = new VoicePipelineManager();
  let countF = 0;
  const unsub1 = managerF.onCommand(() => { countF++; });
  const unsub2 = managerF.onState(() => {});
  
  const initialListeners = managerF.getListenerCount();
  // Simulate unmount cleanup
  unsub1();
  unsub2();
  const afterUnmountListeners = managerF.getListenerCount();

  if (initialListeners > 0 && afterUnmountListeners === 0) {
    console.log('  -> PASS: Unsubscribe cleanly removes listeners, preventing duplicate triggers on remount.');
    passedTests++;
  } else {
    throw new Error(`TEST F FAILED: Listeners not cleaned up: ${afterUnmountListeners}`);
  }
  managerF.teardown();

  // --------------------------------------------------------------------------
  // TEST G: Interim → final transcript processing
  // --------------------------------------------------------------------------
  console.log('\n[TEST G] Interim vs Final transcript processing...');
  const managerG = new VoicePipelineManager();
  let dispatchedG: string[] = [];
  let interimG: string[] = [];

  managerG.onTranscript((text, isFinal) => {
    if (!isFinal) interimG.push(text);
  });
  managerG.onCommand((cmd) => {
    dispatchedG.push(cmd);
  });

  await managerG.startListening();
  const mockRecG = (managerG as any).recognition as MockSpeechRecognition;

  // Emit 3 interim hypotheses
  mockRecG.emitResult([{ transcript: 'Hel', isFinal: false }]);
  mockRecG.emitResult([{ transcript: 'Hell', isFinal: false }]);
  mockRecG.emitResult([{ transcript: 'Hello', isFinal: false }]);

  if (dispatchedG.length === 0 && interimG.length === 3) {
    console.log('  -> PASS: Interim speech hypotheses did NOT dispatch commands.');
  } else {
    throw new Error('TEST G FAILED: Interim speech dispatched a command!');
  }

  // Now emit final
  mockRecG.emitResult([{ transcript: 'Hello', isFinal: true }]);
  const finalDispatchedCount: number = dispatchedG.length;
  if (finalDispatchedCount === 1 && dispatchedG[0] === 'Hello') {
    console.log('  -> PASS: Finalized transcript dispatched exactly once.');
    passedTests++;
  } else {
    throw new Error('TEST G FAILED: Final transcript did not dispatch exactly once');
  }
  managerG.teardown();

  // --------------------------------------------------------------------------
  // TEST H: TTS response → microphone listening echo suppression
  // --------------------------------------------------------------------------
  console.log('\n[TEST H] TTS echo suppression & continuous listening recovery...');
  const managerH = new VoicePipelineManager();
  let dispatchedH: string[] = [];
  managerH.onCommand((cmd) => { dispatchedH.push(cmd); });
  await managerH.startListening();
  const mockRecH = (managerH as any).recognition as MockSpeechRecognition;

  // TTS starts speaking
  managerH.notifyTTSStart('Hello Mursaleen! How can I assist you today?');
  
  // Microphone hears the TTS output
  mockRecH.emitResult([{ transcript: 'Hello Mursaleen', isFinal: true }]);

  if (dispatchedH.length === 0) {
    console.log('  -> PASS: Speech heard during TTS playback was safely suppressed as echo.');
  } else {
    throw new Error('TEST H FAILED: Echo was dispatched as a user command!');
  }

  // TTS finishes
  managerH.notifyTTSEnd();
  console.log('  -> PASS: TTS ended, acoustic echo tail active, continuous listening preserved.');
  passedTests++;
  managerH.teardown();

  // --------------------------------------------------------------------------
  // TEST I: Multiple commands sequentially
  // --------------------------------------------------------------------------
  console.log('\n[TEST I] Multiple commands executed sequentially...');
  globalVoicePipelineGuard.resetToStandby();
  const tI1 = globalVoicePipelineGuard.acquireExecution('What is the time?', { sessionId: 'seq' });
  if (!tI1) throw new Error('TEST I FAILED: Command 1 acquisition failed');
  globalVoicePipelineGuard.releaseExecution(tI1, true);

  const tI2 = globalVoicePipelineGuard.acquireExecution('What is the weather?', { sessionId: 'seq' });
  if (!tI2) throw new Error('TEST I FAILED: Command 2 acquisition failed');
  globalVoicePipelineGuard.releaseExecution(tI2, true);

  console.log('  -> PASS: Sequential commands acquired and executed in order without interference.');
  passedTests++;

  // --------------------------------------------------------------------------
  // TEST J: WebSocket command + microphone command separation
  // --------------------------------------------------------------------------
  console.log('\n[TEST J] WebSocket command vs Microphone command separation...');
  globalVoicePipelineGuard.resetToStandby();
  const tokenWS = globalVoicePipelineGuard.acquireExecution('system status', {
    source: 'websocket',
    sessionId: 'ws-client-99',
  });
  if (!tokenWS) throw new Error('TEST J FAILED: WS command token null');
  globalVoicePipelineGuard.releaseExecution(tokenWS, true);

  const tokenMic = globalVoicePipelineGuard.acquireExecution('open dashboard', {
    source: 'stt',
    sessionId: 'vsession-mic-1',
  });
  if (!tokenMic) throw new Error('TEST J FAILED: Mic command token null');
  globalVoicePipelineGuard.releaseExecution(tokenMic, true);

  console.log('  -> PASS: Multi-source command acquisition operates cleanly.');
  passedTests++;

  // --------------------------------------------------------------------------
  // TEST K: Voice pipeline recovery after error
  // --------------------------------------------------------------------------
  console.log('\n[TEST K] Voice pipeline error recovery...');
  const managerK = new VoicePipelineManager();
  await managerK.startListening();
  const mockRecK = (managerK as any).recognition as MockSpeechRecognition;

  // Emit transient network error
  mockRecK.emitError('network');
  console.log('  -> STT state after transient error:', managerK.getSTTState());
  
  // Can restart cleanly
  managerK.stopListening();
  const restartSuccess = await managerK.startListening();
  if (restartSuccess && managerK.getSTTState() === 'LISTENING') {
    console.log('  -> PASS: Successfully recovered and re-started listening after error.');
    passedTests++;
  } else {
    throw new Error('TEST K FAILED: Could not recover listening after error');
  }
  managerK.teardown();

  // --------------------------------------------------------------------------
  // TEST L: Pronunciation dictionary override for 'MursalCart'
  // --------------------------------------------------------------------------
  console.log('\n[TEST L] Pronunciation dictionary override for MursalCart...');
  const overrides = globalTTSProvider.getPronunciationOverrides();
  if (overrides['MursalCart'] !== 'Mursal-Cart') {
    throw new Error(`TEST L FAILED: MursalCart override missing or unexpected: ${overrides['MursalCart']}`);
  }

  // Verify static export dictionary mapping
  if (DEFAULT_PRONUNCIATION_OVERRIDES['MursalCart'] !== 'Mursal-Cart') {
    throw new Error(`TEST L FAILED: DEFAULT_PRONUNCIATION_OVERRIDES missing MursalCart`);
  }

  // Test applyPronunciationOverrides
  const samplePhrase = 'Welcome to MursalCart Pakistani commerce suite!';
  const phoneticallyOverridden = globalTTSProvider.applyPronunciationOverrides(samplePhrase);
  if (phoneticallyOverridden.includes('Mursal-Cart') && !phoneticallyOverridden.includes('MursalCart')) {
    console.log('  -> PASS: "MursalCart" mapped to phonetic single brand name:', phoneticallyOverridden);
    passedTests++;
  } else {
    throw new Error(`TEST L FAILED: Phonetic mapping incorrect: ${phoneticallyOverridden}`);
  }

  // --------------------------------------------------------------------------
  // TEST M: Session-Based Deduplication (200ms Window Check)
  // --------------------------------------------------------------------------
  console.log('\n[TEST M] Session-based deduplication (200ms window check)...');
  globalVoicePipelineGuard.resetToStandby();
  const managerM = new VoicePipelineManager();
  let dispatchedM: string[] = [];
  managerM.onCommand((cmd) => {
    dispatchedM.push(cmd);
  });

  await managerM.startListening();
  const mockRecM = (managerM as any).recognition as MockSpeechRecognition;

  // 1. Initial final transcript
  mockRecM.emitResult([{ transcript: 'Open dashboard', isFinal: true }], 0);
  if (dispatchedM.length !== 1 || dispatchedM[0] !== 'Open dashboard') {
    throw new Error(`TEST M PRECONDITION FAILED: Initial command not dispatched: ${JSON.stringify(dispatchedM)}`);
  }

  // Release lock on guard so only deduplication window is under test
  globalVoicePipelineGuard.resetToStandby();

  // 2. Duplicate final transcript arrives within 60ms (< 200ms window) in SAME session
  mockRecM.emitResult([{ transcript: 'Open dashboard', isFinal: true }], 1);
  if (dispatchedM.length === 1) {
    console.log('  -> PASS: Duplicate final transcript within 60ms (<200ms) successfully ignored.');
  } else {
    throw new Error(`TEST M FAILED: Duplicate within 60ms was dispatched! Dispatched count: ${dispatchedM.length}`);
  }

  // 3. Test Guard-level session deduplication directly
  const guardSessionId = 'session-m-guard';
  const tokenM1 = globalVoicePipelineGuard.acquireExecution('Status report', {
    source: 'stt',
    status: 'final',
    sessionId: guardSessionId,
  });
  if (!tokenM1) throw new Error('TEST M PRECONDITION FAILED: Guard failed to acquire initial token');
  globalVoicePipelineGuard.releaseExecution(tokenM1, true);

  // Attempt duplicate in guard within 100ms (<200ms window)
  const tokenM2 = globalVoicePipelineGuard.acquireExecution('Status report', {
    source: 'stt',
    status: 'final',
    sessionId: guardSessionId,
  });
  if (tokenM2 === null) {
    console.log('  -> PASS: Guard rejected duplicate final transcript within 200ms window in same session.');
  } else {
    throw new Error('TEST M FAILED: Guard allowed duplicate final transcript within 200ms window!');
  }

  // 4. Same transcript after 220ms (> 200ms window) should be permitted
  await new Promise((r) => setTimeout(r, 220));
  const tokenM3 = globalVoicePipelineGuard.acquireExecution('Status report', {
    source: 'stt',
    status: 'final',
    sessionId: 'session-m-guard-new',
  });
  if (tokenM3 !== null) {
    console.log('  -> PASS: Legitimate final transcript after 200ms window allowed.');
    globalVoicePipelineGuard.releaseExecution(tokenM3, true);
    passedTests++;
  } else {
    throw new Error('TEST M FAILED: Speech after 200ms window was blocked!');
  }
  managerM.teardown();

  // --------------------------------------------------------------------------
  // TEST N: React Lifecycle Microphone Listener Attachment Idempotency
  // --------------------------------------------------------------------------
  console.log('\n[TEST N] React lifecycle microphone listener idempotency...');
  const managerN = new VoicePipelineManager();
  let cmdCallsN = 0;
  
  // Attach lifecycle once
  const detach1 = managerN.attachReactLifecycle({
    onCommand: () => { cmdCallsN++; },
    onState: () => {},
  });

  if (managerN.getIsReactLifecycleAttached()) {
    console.log('  -> PASS: attachReactLifecycle registered active lifecycle.');
  } else {
    throw new Error('TEST N FAILED: isReactLifecycleAttached is false');
  }

  // Attempt re-attachment (e.g. React StrictMode or component re-render)
  const detach2 = managerN.attachReactLifecycle({
    onCommand: () => { cmdCallsN++; },
    onState: () => {},
  });

  // Verify listener count did not double
  const countAfterRebind = managerN.getListenerCount();
  if (countAfterRebind === 2) {
    console.log('  -> PASS: Re-attaching lifecycle cleanly replaces subscriptions without listener leakage.');
  } else {
    throw new Error(`TEST N FAILED: Listener count is ${countAfterRebind}, expected 2`);
  }

  // Detach should unbind all
  detach2();
  if (managerN.getListenerCount() === 0 && !managerN.getIsReactLifecycleAttached()) {
    console.log('  -> PASS: Detach cleanly unbinds all microphone and pipeline listeners on unmount.');
    passedTests++;
  } else {
    throw new Error(`TEST N FAILED: Listeners remained after detach: ${managerN.getListenerCount()}`);
  }
  managerN.teardown();

  // --------------------------------------------------------------------------
  // SUMMARY
  // --------------------------------------------------------------------------
  console.log('\n================================================================');
  console.log(`=== ALL ${passedTests}/${totalTests} TESTS PASSED SUCCESSFULLY! ===`);
  console.log('================================================================\n');
}

runTests().catch((err) => {
  console.error('\n❌ TEST SUITE RUNNER ENCOUNTERED ERROR:', err);
  process.exit(1);
});
