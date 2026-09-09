/**
 * MURSAL JARVIS — Phase 3 Verification Suite
 * 
 * Comprehensive testing for:
 * 1. Buffered SSE Stream Parser (fragmented frames, multi-event chunks, [DONE], malformed data)
 * 2. Local Engine Adapter (health probe, dynamic model discovery, cancellation, timeout, offline resilience)
 * 3. AI Provider Gateway Multi-Tier Routing (CLOUD_FIRST, LOCAL_FIRST, AUTO, graceful fallback)
 * 4. Autonomous /learn Skill Synthesizer (multi-step success, failed task rejection, secret filtering, deduplication, staged isolation)
 * 5. Unified Memory Store (SQLite indexing, MEMORY.md / USER.md sync, SECRET exclusion, duplicate prevention)
 */

import http from 'http';
import fs from 'fs';
import path from 'path';
import { BufferedSseParser } from '../src/lib/bufferedSseParser.ts';
import { LocalEngineAdapter } from '../src/lib/localEngineAdapter.ts';
import { AIProviderGateway } from '../src/lib/aiProviderGateway.ts';
import { SkillSynthesizer, TaskTrace } from '../src/lib/skillSynthesizer.ts';
import { UnifiedMemoryManager } from '../src/lib/memoryManager.ts';
import { ToolRegistry } from '../src/lib/toolRegistry.ts';
import { SkillRegistry } from '../src/lib/skillRegistry.ts';

interface TestRecord {
  num: number;
  name: string;
  passed: boolean;
  message?: string;
}

const results: TestRecord[] = [];

function assert(condition: boolean, msg: string) {
  if (!condition) throw new Error(`Assertion failed: ${msg}`);
}

async function runTest(num: number, name: string, fn: () => Promise<void>) {
  try {
    await fn();
    results.push({ num, name, passed: true });
    console.log(`[PASS] Test ${num}: ${name}`);
  } catch (err: any) {
    results.push({ num, name, passed: false, message: err?.message || String(err) });
    console.error(`[FAIL] Test ${num}: ${name} ->`, err?.message || err);
  }
}

async function main() {
  console.log('\n===============================================================');
  console.log('       MURSAL JARVIS PHASE 3 LOCAL & AUTONOMOUS VERIFICATION   ');
  console.log('===============================================================\n');

  // -------------------------------------------------------------
  // SECTION 1: BUFFERED SSE STREAM PARSER TESTS
  // -------------------------------------------------------------

  await runTest(1, 'BufferedSseParser handles fragmented frames split across chunks', async () => {
    const parser = new BufferedSseParser();

    // Frame: data: {"token": "Hello "} split into 3 fragments
    const frag1 = 'dat';
    const frag2 = 'a: {"token": "He';
    const frag3 = 'llo "}\n\n';

    let msgs = parser.feed(frag1);
    assert(msgs.length === 0, 'Incomplete chunk must not produce message');

    msgs = parser.feed(frag2);
    assert(msgs.length === 0, 'Second fragment still incomplete');

    msgs = parser.feed(frag3);
    assert(msgs.length === 1, 'Completed chunk must yield message');
    assert(msgs[0].data === '{"token": "Hello "}', 'Data must be parsed exactly');
  });

  await runTest(2, 'BufferedSseParser handles multiple events packed in a single chunk', async () => {
    const parser = new BufferedSseParser();
    const multiChunk = 'data: {"id": 1}\n\ndata: {"id": 2}\n\ndata: {"id": 3}\n\n';

    const msgs = parser.feed(multiChunk);
    assert(msgs.length === 3, `Expected 3 messages, got ${msgs.length}`);
    assert(JSON.parse(msgs[0].data).id === 1, 'First message matches');
    assert(JSON.parse(msgs[1].data).id === 2, 'Second message matches');
    assert(JSON.parse(msgs[2].data).id === 3, 'Third message matches');
  });

  await runTest(3, 'BufferedSseParser processes [DONE] termination correctly', async () => {
    const parser = new BufferedSseParser();
    const chunk = 'data: {"text": "end"}\n\ndata: [DONE]\n\ndata: {"ignored": true}\n\n';

    const msgs = parser.feed(chunk);
    assert(parser.isDone() === true, 'Parser must be marked terminated after [DONE]');
    assert(msgs.some((m) => m.data === '[DONE]'), 'Must include [DONE] message');
  });

  await runTest(4, 'BufferedSseParser safely skips malformed lines and comments without dropping valid frames', async () => {
    const parser = new BufferedSseParser();
    const noisyChunk = ': heartbeat comment\nmalformed garbage line\ndata: {"valid": true}\n\n';

    const msgs = parser.feed(noisyChunk);
    assert(msgs.length === 1, 'Should extract only the valid data frame');
    assert(JSON.parse(msgs[0].data).valid === true, 'Valid payload preserved');
  });

  // -------------------------------------------------------------
  // SECTION 2: LOCAL ENGINE ADAPTER TESTS
  // -------------------------------------------------------------

  await runTest(5, 'LocalEngineAdapter handles offline/unreachable engine gracefully', async () => {
    // Point to non-existent port to test offline degradation
    const offlineAdapter = new LocalEngineAdapter({
      baseUrl: 'http://127.0.0.1:54321/v1',
      timeoutMs: 1500,
    });

    const health = await offlineAdapter.checkHealth();
    assert(health.reachable === false, 'Offline engine must report reachable: false');
    assert(health.installedModelsCount === 0, 'Offline engine has 0 installed models');

    const models = await offlineAdapter.discoverModels();
    assert(models.length === 0, 'Offline discovery returns empty array without throwing');
  });

  // Setup lightweight mock Ollama server on ephemeral port for functional tests
  const mockPort = 11435;
  const mockServer = http.createServer((req, res) => {
    const url = req.url || '';

    if (url === '/models' || url === '/v1/models') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        data: [
          { id: 'qwen2.5:7b', object: 'model' },
          { id: 'deepseek-r1:8b', object: 'model' },
          { id: 'llama3.2:latest', object: 'model' },
        ],
      }));
      return;
    }

    if (url === '/chat/completions' || url === '/v1/chat/completions') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      });
      res.write('data: {"choices":[{"delta":{"content":"Salam "}}]}\n\n');
      res.write('data: {"choices":[{"delta":{"content":"Mursaleen!"}}]}\n\n');
      res.write('data: [DONE]\n\n');
      res.end();
      return;
    }

    res.writeHead(404);
    res.end();
  });

  await new Promise<void>((resolve) => mockServer.listen(mockPort, resolve));

  const localAdapter = new LocalEngineAdapter({
    baseUrl: `http://localhost:${mockPort}/v1`,
    timeoutMs: 4000,
  });

  await runTest(6, 'LocalEngineAdapter dynamic model discovery & best model selection', async () => {
    const models = await localAdapter.discoverModels(true);
    assert(models.length === 3, `Expected 3 discovered models, found ${models.length}`);

    const bestModel = localAdapter.selectBestModel(models);
    assert(bestModel?.id === 'qwen2.5:7b', `Expected qwen2.5:7b as top choice, got ${bestModel?.id}`);

    const isQwenAvailable = await localAdapter.isModelAvailable('qwen2.5:7b');
    assert(isQwenAvailable === true, 'qwen2.5:7b must be reported available');

    const isNonExistentAvailable = await localAdapter.isModelAvailable('non-existent-model:99b');
    assert(isNonExistentAvailable === false, 'Unknown model must be reported unavailable');
  });

  await runTest(7, 'LocalEngineAdapter streaming chat completion & metrics', async () => {
    const chunks: string[] = [];
    const streamRes = await localAdapter.streamChat({
      model: 'qwen2.5:7b',
      messages: [{ role: 'user', content: 'hello' }],
      onChunk: (c) => chunks.push(c),
    });

    assert(streamRes !== null, 'Stream result must not be null');
    assert(streamRes?.fullText === 'Salam Mursaleen!', `Expected 'Salam Mursaleen!', got '${streamRes?.fullText}'`);
    assert(chunks.length === 2, `Expected 2 chunks, got ${chunks.length}`);
    assert(streamRes?.metrics.totalLatencyMs >= 0, 'Total latency metric recorded');
  });

  await runTest(8, 'LocalEngineAdapter cancellation via AbortSignal', async () => {
    const abortController = new AbortController();
    abortController.abort(); // Pre-aborted

    const streamRes = await localAdapter.streamChat({
      model: 'qwen2.5:7b',
      messages: [{ role: 'user', content: 'test cancel' }],
      abortSignal: abortController.signal,
    });

    assert(streamRes === null, 'Pre-aborted request must immediately return null');
  });

  // -------------------------------------------------------------
  // SECTION 3: AI PROVIDER GATEWAY ROUTING MODES
  // -------------------------------------------------------------

  await runTest(9, 'AIProviderGateway routes with LOCAL_FIRST, CLOUD_FIRST, and AUTO modes', async () => {
    const gateway = new AIProviderGateway(localAdapter);

    // 1. LOCAL_FIRST mode: Ollama should be prioritized first
    gateway.setRoutingMode('LOCAL_FIRST');
    const localFirstProviders = await gateway.getResolvedProviders('FAST');
    assert(localFirstProviders.length > 0, 'Must have resolved providers');
    assert(localFirstProviders[0].name === 'OLLAMA_LOCAL', `First provider in LOCAL_FIRST must be OLLAMA_LOCAL, got ${localFirstProviders[0].name}`);

    // 2. Stream through gateway using local engine
    const streamRes = await gateway.stream({
      contents: 'salam',
      routingMode: 'LOCAL_FIRST',
    });

    assert(streamRes !== null, 'Gateway streaming must succeed');
    assert(streamRes?.engineMode === 'LOCAL_OLLAMA_ENGINE', `Expected LOCAL_OLLAMA_ENGINE, got ${streamRes?.engineMode}`);
    assert(streamRes?.fullText === 'Salam Mursaleen!', `Expected fullText, got ${streamRes?.fullText}`);
  });

  // Clean up mock server
  mockServer.close();

  // -------------------------------------------------------------
  // SECTION 4: AUTONOMOUS /LEARN SKILL SYNTHESIS
  // -------------------------------------------------------------

  const toolReg = new ToolRegistry();
  const skillReg = new SkillRegistry();
  const tempStagedDir = path.join(process.cwd(), 'skills', 'staged');
  const synthesizer = new SkillSynthesizer(toolReg, skillReg, tempStagedDir);

  await runTest(10, 'SkillSynthesizer generates staged skill from successful multi-step task', async () => {
    const trace: TaskTrace = {
      taskId: 'task-test-synth-1',
      goal: 'audit daraz product viability and sound alert',
      success: true,
      steps: [
        {
          stepNumber: 1,
          thought: 'Evaluating product economics',
          actionTool: 'mursalcart_eval_product',
          actionParams: { productName: 'Smart Watch', procurementPkr: 1000, sellingPkr: 2200 },
          isTerminal: false,
        },
        {
          stepNumber: 2,
          thought: 'Sounding locator beacon',
          actionTool: 'device_anti_loss_siren',
          actionParams: {},
          isTerminal: true,
        },
      ],
      totalDurationMs: 450,
      completedAt: Date.now(),
    };

    const res = await synthesizer.analyzeAndLearn(trace);
    assert(res.synthesized === true, 'Multi-step successful task must generate skill');
    assert(res.manifest !== undefined, 'Manifest must be created');
    assert(res.manifest?.isStaged === true, 'New skill must be in staged state');
    assert(res.manifest?.isEnabled === false, 'Staged skill must not be enabled by default');
    assert(res.manifest?.riskClass === 'P1_CONTROLLED', 'Risk class must reflect device_anti_loss_siren (P1)');
    assert(res.manifest?.requiredTools.includes('mursalcart_eval_product'), 'Must require product eval');
    assert(res.manifest?.requiredTools.includes('device_anti_loss_siren'), 'Must require siren');
  });

  await runTest(11, 'SkillSynthesizer rejects failed tasks and single-step tasks', async () => {
    // 1. Failed task
    const failedTrace: TaskTrace = {
      taskId: 'task-failed',
      goal: 'failing command',
      success: false,
      steps: [
        { stepNumber: 1, thought: 't1', actionTool: 'device_battery', isTerminal: false },
        { stepNumber: 2, thought: 't2', actionTool: 'device_flashlight', isTerminal: true },
      ],
      totalDurationMs: 100,
      completedAt: Date.now(),
    };
    const failRes = await synthesizer.analyzeAndLearn(failedTrace);
    assert(failRes.synthesized === false, 'Failed task must not generate a skill');

    // 2. Single step task
    const singleStepTrace: TaskTrace = {
      taskId: 'task-single',
      goal: 'check battery',
      success: true,
      steps: [
        { stepNumber: 1, thought: 't1', actionTool: 'device_battery', isTerminal: true },
      ],
      totalDurationMs: 50,
      completedAt: Date.now(),
    };
    const singleRes = await synthesizer.analyzeAndLearn(singleStepTrace);
    assert(singleRes.synthesized === false, 'Single tool task must not generate a skill');
  });

  await runTest(12, 'SkillSynthesizer rejects traces containing leaked secrets or credentials', async () => {
    const leakTrace: TaskTrace = {
      taskId: 'task-leak',
      goal: 'fetch private data using token=sk-live-supersecrettoken1234567890',
      success: true,
      steps: [
        { stepNumber: 1, thought: 'Step 1', actionTool: 'web_search', isTerminal: false },
        { stepNumber: 2, thought: 'Step 2', actionTool: 'mursalcart_eval_product', isTerminal: true },
      ],
      totalDurationMs: 200,
      completedAt: Date.now(),
    };

    const res = await synthesizer.analyzeAndLearn(leakTrace);
    assert(res.synthesized === false, 'Trace with secrets must be rejected by security policy');
    assert(res.reason?.includes('SECURITY_REJECTION'), 'Reason must specify security rejection');
  });

  await runTest(13, 'SkillSynthesizer deduplicates against existing or previously staged skills', async () => {
    const trace: TaskTrace = {
      taskId: 'task-dup-1',
      goal: 'duplicate audit daraz and sound alert',
      success: true,
      steps: [
        { stepNumber: 1, thought: 'Step 1', actionTool: 'mursalcart_eval_product', isTerminal: false },
        { stepNumber: 2, thought: 'Step 2', actionTool: 'device_anti_loss_siren', isTerminal: true },
      ],
      totalDurationMs: 300,
      completedAt: Date.now(),
    };

    // Second time with identical tool combination should be deduplicated
    const res = await synthesizer.analyzeAndLearn(trace);
    assert(res.synthesized === false, 'Duplicate skill pattern must be deduplicated');
    assert(res.reason?.includes('DEDUPLICATED'), 'Reason must specify deduplication');
  });

  // -------------------------------------------------------------
  // SECTION 5: UNIFIED MEMORY (SQLite + MEMORY.md + USER.md)
  // -------------------------------------------------------------

  const memoryManager = new UnifiedMemoryManager();

  await runTest(14, 'UnifiedMemoryManager saves, updates, searches, and prevents duplicates', async () => {
    // 1. Save new memory
    const item1 = await memoryManager.save({
      scope: 'LONG_TERM',
      classification: 'NORMAL',
      key: 'shipping_courier_leopards',
      content: 'Leopards Courier COD return rate in Punjab is 12%.',
      tags: ['courier', 'leopards', 'punjab'],
      importance: 7,
    });

    assert(item1.id.startsWith('mem-'), 'Memory ID must be generated');

    // 2. Duplicate prevention on same key & scope: updates instead of creating duplicate
    const item1Duplicate = await memoryManager.save({
      scope: 'LONG_TERM',
      classification: 'NORMAL',
      key: 'shipping_courier_leopards',
      content: 'Updated: Leopards Courier COD return rate in Punjab is 11.5%.',
      tags: ['courier', 'punjab', 'revised'],
      importance: 8,
    });

    assert(item1Duplicate.id === item1.id, 'Duplicate (scope, key) must update existing record ID');
    assert(item1Duplicate.content.includes('11.5%'), 'Content must be updated');

    // 3. Search
    const searchRes = await memoryManager.search({ query: 'leopards' });
    assert(searchRes.length === 1, 'Search must return single updated record');
    assert(searchRes[0].id === item1.id, 'Found correct record');
  });

  await runTest(15, 'UnifiedMemoryManager strictly excludes SECRET items from MEMORY.md and USER.md', async () => {
    // Save a SECRET item
    await memoryManager.save({
      scope: 'USER_PROFILE',
      classification: 'SECRET',
      key: 'private_bank_pin',
      content: 'Sensitive auth code 849204',
      tags: ['auth', 'pin'],
      importance: 10,
    });

    // Save a NORMAL item
    await memoryManager.save({
      scope: 'USER_PROFILE',
      classification: 'NORMAL',
      key: 'favorite_city',
      content: 'Lahore, Pakistan',
      tags: ['city', 'location'],
      importance: 6,
    });

    const userMd = await memoryManager.exportMarkdown('USER.md');
    assert(userMd.includes('Lahore, Pakistan'), 'NORMAL item must appear in USER.md');
    assert(!userMd.includes('849204'), 'SECRET item must NEVER appear in USER.md');
    assert(!userMd.includes('private_bank_pin'), 'SECRET key must NEVER appear in USER.md');
  });

  await runTest(16, 'UnifiedMemoryManager atomic filesystem sync (MEMORY.md / USER.md)', async () => {
    await memoryManager.syncToFilesystem();

    const userMdPath = path.join(process.cwd(), 'USER.md');
    const memoryMdPath = path.join(process.cwd(), 'MEMORY.md');

    assert(fs.existsSync(userMdPath), 'USER.md must exist on filesystem');
    assert(fs.existsSync(memoryMdPath), 'MEMORY.md must exist on filesystem');

    const userMdContent = fs.readFileSync(userMdPath, 'utf-8');
    assert(userMdContent.includes('# USER.md'), 'USER.md contains header');
    assert(userMdContent.includes('Mursaleen'), 'USER.md contains user identity');
  });

  await runTest(17, 'UnifiedMemoryManager reloads and synchronizes from filesystem on start', async () => {
    // Create new manager instance in same root to test syncFromFilesystem
    const freshManager = new UnifiedMemoryManager();
    const importedCount = await freshManager.syncFromFilesystem();

    assert(importedCount >= 0, 'Must successfully parse and synchronize filesystem markdown');
    const searchRes = await freshManager.search({ query: 'Mursaleen' });
    assert(searchRes.length > 0, 'Re-synchronized manager must recall user identity');
  });

  console.log('\n===============================================================');
  console.log('                 PHASE 3 VERIFICATION SUMMARY                  ');
  console.log('===============================================================');
  const passedCount = results.filter((r) => r.passed).length;
  console.log(`Passed: ${passedCount} / ${results.length}`);
  if (passedCount === results.length) {
    console.log('STATUS: ALL 17 PHASE 3 TESTS PASSED (100% SUCCESS)\n');
  } else {
    console.error(`STATUS: ${results.length - passedCount} TESTS FAILED\n`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
