import WebSocket from 'ws';

async function runScreenPipelineTest() {
  console.log('====================================================');
  console.log('  MURSAL JARVIS REALTIME SCREEN INTELLIGENCE AUDIT  ');
  console.log('====================================================');

  const BASE_URL = 'http://127.0.0.1:3000';
  const WS_URL = 'ws://127.0.0.1:3000/ws';

  // 1. Initial State Check
  console.log('\n[1] Querying /api/jarvis/screen/current:');
  const res1 = await fetch(`${BASE_URL}/api/jarvis/screen/current`);
  const state1 = await res1.json();
  console.log('Status: OK, Foreground:', state1.foregroundPackage, '| Mode:', state1.monitoringMetrics?.status);

  // 2. Continuous Monitoring Start Test
  console.log('\n[2] Testing Continuous Monitoring Activation:');
  const startRes = await fetch(`${BASE_URL}/api/jarvis/screen/monitor/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode: 'PERIODIC_SAMPLING', intervalMs: 1000 }),
  });
  const startData = await startRes.json();
  console.log('Start Response:', startData.message);
  console.log('Metrics:', JSON.stringify(startData.metrics, null, 2));

  // 3. Screen Ingestion (Simulating Android MediaProjection & Accessibility frame)
  console.log('\n[3] Ingesting Android Screen Frame 1 (WhatsApp Chat with Ali):');
  const frame1Payload = {
    clientTimestamp: Date.now(),
    foregroundPackage: 'com.whatsapp',
    foregroundActivity: 'ConversationActivity',
    screenWidth: 1080,
    screenHeight: 2400,
    ocrText: 'Ali: Bhai payment kab send karoge? Bank account number de diya hai.',
    accessibilityTree: [
      { nodeId: 'top_bar', className: 'android.widget.TextView', text: 'Ali', isClickable: false },
      { nodeId: 'msg_1', className: 'android.widget.TextView', text: 'Bhai payment kab send karoge? Bank account number de diya hai.', isClickable: true },
      { nodeId: 'btn_send', className: 'android.widget.ImageButton', text: 'Send', isClickable: true },
    ],
  };
  const updateRes1 = await fetch(`${BASE_URL}/api/jarvis/screen/update`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(frame1Payload),
  });
  const updateData1 = await updateRes1.json();
  console.log('Frame 1 ingested. Metrics:', JSON.stringify(updateData1.monitoringMetrics, null, 2));

  // 4. Test "JARVIS, screen par kya ho raha hai?" for Frame 1
  console.log('\n[4] Querying JARVIS: "JARVIS, screen par kya ho raha hai?"');
  const chatRes1 = await fetch(`${BASE_URL}/api/jarvis/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: 'JARVIS, screen par kya ho raha hai?', language: 'ur-Roman' }),
  });
  const chatData1 = await chatRes1.json();
  console.log('Detected Intent:', chatData1.detectedIntent);
  console.log('JARVIS Reply:', chatData1.reply);
  console.log('Screen Analysis Summary:', chatData1.screenAnalysis?.summary);

  // 5. Ingest Frame 2 (User switches to YouTube Playing a Cricket Highlight)
  console.log('\n[5] Changing Screen Content: Ingesting Frame 2 (YouTube App):');
  const frame2Payload = {
    clientTimestamp: Date.now(),
    foregroundPackage: 'com.google.android.youtube',
    foregroundActivity: 'WatchWhileActivity',
    screenWidth: 1080,
    screenHeight: 2400,
    ocrText: 'Babar Azam sensational 100 vs Australia | Match Highlights | 4.2M views',
    accessibilityTree: [
      { nodeId: 'video_title', className: 'android.widget.TextView', text: 'Babar Azam sensational 100 vs Australia | Match Highlights', isClickable: true },
      { nodeId: 'channel_name', className: 'android.widget.TextView', text: 'PCB Official', isClickable: true },
      { nodeId: 'btn_subscribe', className: 'android.widget.Button', text: 'Subscribe', isClickable: true },
    ],
  };
  const updateRes2 = await fetch(`${BASE_URL}/api/jarvis/screen/update`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(frame2Payload),
  });
  const updateData2 = await updateRes2.json();
  console.log('Frame 2 ingested. Metrics:', JSON.stringify(updateData2.monitoringMetrics, null, 2));

  // 6. Test Query on Frame 2 (Demonstrating dynamic context update, not static mock!)
  console.log('\n[6] Querying JARVIS after screen change: "JARVIS, screen par kya chal raha hai?"');
  const chatRes2 = await fetch(`${BASE_URL}/api/jarvis/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: 'JARVIS, screen par kya chal raha hai?', language: 'ur-Roman' }),
  });
  const chatData2 = await chatRes2.json();
  console.log('JARVIS Reply:', chatData2.reply);
  console.log('Screen Analysis Summary:', chatData2.screenAnalysis?.summary);

  // 7. Test Continuous Monitoring Voice Trigger: "JARVIS, screen ko monitor karo"
  console.log('\n[7] Testing Voice Command: "JARVIS, screen ko monitor karo"');
  const monitorChatRes = await fetch(`${BASE_URL}/api/jarvis/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: 'JARVIS, screen ko monitor karo', language: 'ur-Roman' }),
  });
  const monitorChatData = await monitorChatRes.json();
  console.log('Detected Intent:', monitorChatData.detectedIntent);
  console.log('JARVIS Reply:', monitorChatData.reply);
  console.log('Active Monitoring Metrics:', monitorChatData.monitoringMetrics);

  // 8. WebSocket Live Streaming Test
  console.log('\n[8] Testing Realtime WebSocket Frame Ingestion & ACK:');
  await new Promise<void>((resolve, reject) => {
    const ws = new WebSocket(WS_URL);
    ws.on('open', () => {
      console.log('Connected to JARVIS WebSocket.');
      // Send SCREEN_UPDATE message
      ws.send(JSON.stringify({
        type: 'SCREEN_UPDATE',
        payload: {
          clientTimestamp: Date.now(),
          foregroundPackage: 'com.mursal.laptop.desktop',
          foregroundActivity: 'Visual Studio Code',
          ocrText: 'Active coding session: MURSAL JARVIS Architecture',
          screenWidth: 1920,
          screenHeight: 1080,
        },
      }));
    });

    ws.on('message', (data: any) => {
      const parsed = JSON.parse(data.toString());
      if (parsed.type === 'SCREEN_UPDATE_ACK') {
        console.log('Received SCREEN_UPDATE_ACK via WebSocket:', parsed.payload);
        ws.close();
        resolve();
      }
    });

    ws.on('error', (err: any) => {
      console.error('WS Error:', err);
      reject(err);
    });
  });

  // 9. Stop Monitoring Test
  console.log('\n[9] Stopping Monitoring:');
  const stopRes = await fetch(`${BASE_URL}/api/jarvis/screen/monitor/stop`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  const stopData = await stopRes.json();
  console.log('Stop Response:', stopData.message);
  console.log('Final Metrics:', stopData.metrics);

  console.log('\n====================================================');
  console.log('  ALL SCREEN INTELLIGENCE PIPELINE CHECKS COMPLETED ');
  console.log('====================================================\n');
}

runScreenPipelineTest().catch((err) => {
  console.error('Audit failed:', err);
  process.exit(1);
});
