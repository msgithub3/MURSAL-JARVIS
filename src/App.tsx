// Active Instant Reply request — allows true barge-in cancellation
  const activeReplyCommandRef = useRef<string | null>(null);
  const activeReplyTokenRef = useRef<CommandLockToken | null>(null);
  const streamingTextRef = useRef<string>('');
  const streamingMessageIdRef = useRef<string | null>(null);
  const streamingSessionIdRef = useRef<string | null>(null);

  // Instant Barge-In / Speech Interruption
  const handleInterrupt = () => {
    // Stop browser speech immediately
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }

    // Stop provider-level streaming TTS immediately
    globalTTSProvider.cancel();

    // Clear active streaming state
    activeReplyCommandRef.current = null;
    streamingTextRef.current = '';
    streamingMessageIdRef.current = null;
    streamingSessionIdRef.current = null;

    setIsSpeaking(false);
    setIsLoadingReply(false);
    isSendingRef.current = false;

    globalVoicePipelineGuard.resetToStandby();

    const currentLang = languageModeRef.current;
    const ackText =
      currentLang === 'ur'
        ? 'رک گیا جانی! بتائیں اب کیا حکم ہے؟'
        : currentLang === 'pa'
        ? 'رک گیا ویرے! دسو کی حکم اے؟'
        : 'Ruk gaya jani! Batayein ab kya hukam hai?';

    setMessages((prev) => [
      ...prev,
      {
        id: generateMessageId('msg-interrupt'),
        sender: 'jarvis',
        text: ackText,
        timestamp: Date.now(),
        intent: 'INTERRUPTION_BARGE_IN',
      },
    ]);
  };

  handleInterruptRef.current = handleInterrupt;

  // Synchronize language with Voice Pipeline Manager without re-binding listeners
  useEffect(() => {
    globalVoicePipelineManager.setLanguage(languageMode);
  }, [languageMode]);

  // Centralized Voice Pipeline Lifecycle
  useEffect(() => {
    const detachVoiceLifecycle =
      globalVoicePipelineManager.attachReactLifecycle({
        onState: (sttState, listening) => {
          setIsListening(listening);

          if (sttState === 'ERROR') {
            setVoiceSupported(false);
          }
        },

        onTranscript: (text) => {
          setDetectedVoiceText(text);
        },

        onCommand: (cleanQuery, token) => {
          handleSendMessageRef.current(cleanQuery, token);
        },

        onBargeIn: () => {
          handleInterruptRef.current();
        },
      });

    const unsubscribeGuard = globalVoicePipelineGuard.subscribe(
      (_st, ph) => {
        setPhase(ph as JarvisPhase);
      }
    );

    const unsubscribeBargeIn = globalVoicePipelineGuard.onBargeIn(() => {
      globalTTSProvider.cancel();

      activeReplyCommandRef.current = null;
      streamingTextRef.current = '';
      streamingMessageIdRef.current = null;
      streamingSessionIdRef.current = null;

      setIsSpeaking(false);
      setIsLoadingReply(false);
      isSendingRef.current = false;
    });

    const unsubscribeQueue = globalVoicePipelineGuard.onDrainQueue(
      (queuedText, queuedToken) => {
        handleSendMessageRef.current(queuedText, queuedToken);
      }
    );

    return () => {
      detachVoiceLifecycle();
      unsubscribeGuard();
      unsubscribeBargeIn();
      unsubscribeQueue();

      globalTTSProvider.cancel();
    };
  }, []);

  // Central Application WebSocket Lifecycle
  useEffect(() => {
    globalWebSocketManager.connect();

    const unsubWs = globalWebSocketManager.subscribe((info) => {
      setWsConnectionInfo(info);
    });

    return () => {
      unsubWs();
    };
  }, []);

  // TTS helper
  const speakText = async (text: string, userQuery?: string) => {
    if (speechMutedRef.current || !text.trim()) {
      globalVoicePipelineGuard.resetToStandby();
      return;
    }

    setIsSpeaking(true);
    globalVoicePipelineGuard.setPhase('VOICE_RESPONSE');

    try {
      await globalTTSProvider.speak(
        text,
        {
          profile: voiceProfileRef.current,
          language: languageModeRef.current,
        },
        userQuery
      );
    } finally {
      setIsSpeaking(false);
      globalVoicePipelineGuard.resetToStandby();
    }
  };

  const handleExecuteDeviceAction = async (
    action: string,
    params: Record<string, any> = {},
    confirmed = false
  ) => {
    const res = await fetch('/api/jarvis/device/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, params, confirmed }),
    });

    return await res.json();
  };

  const toggleListening = () => {
    globalVoicePipelineManager.toggleListening();
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];

    if (file) {
      const reader = new FileReader();

      reader.onload = (event) => {
        setImagePreview(event.target?.result as string);
      };

      reader.readAsDataURL(file);
    }
  };

  const handleSendMessage = async (
    textToSend?: string,
    existingToken?: CommandLockToken
  ) => {
    const query = textToSend || inputText;

    if (!query.trim() && !imagePreview) {
      return;
    }

    // Prevent a second request from stealing the active execution slot
    if (isSendingRef.current) {
      console.warn(
        '[InstantReply] Request already active; command ignored.'
      );
      return;
    }

    // Acquire lock token if not already supplied by Voice Pipeline
    const token =
      existingToken ||
      globalVoicePipelineGuard.acquireExecution(query, {
        source: 'ui',
        status: 'final',
        timestamp: Date.now(),
      });

    if (!token) {
      console.warn(
        '[InstantReply] Duplicate command suppressed by VoicePipelineGuard.'
      );
      return;
    }

    isSendingRef.current = true;
    activeReplyCommandRef.current = token.commandId;
    activeReplyTokenRef.current = token;
    streamingTextRef.current = '';

    const userMessage: ChatMessage = {
      id: generateMessageId('msg-user'),
      sender: 'user',
      text: query,
      image: imagePreview || undefined,
      timestamp: Date.now(),
    };

    setMessages((prev) => [...prev, userMessage]);

    setInputText('');

    const sentImage = imagePreview;
    setImagePreview(null);

    globalVoicePipelineGuard.setPhase('INTENT_ANALYSIS');
    setIsLoadingReply(true);

    const ws = globalWebSocketManager.getWebSocket?.();

    try {
      /*
       * PRIMARY PATH:
       * Use the existing JARVIS WebSocket Instant Reply protocol.
       *
       * This is intentionally NOT a second HTTP streaming implementation.
       * server.ts already emits:
       *
       * INSTANT_ACK
       * AI_STREAM_START
       * AI_STREAM_SENTENCE
       * AI_STREAM_END
       */

      if (ws && ws.readyState === WebSocket.OPEN) {
        await new Promise<void>((resolve, reject) => {
          let settled = false;
          let fullText = '';
          let replyMessageCreated = false;
          let ttsStarted = false;
          let ttsSessionId: string | null = null;
          let sentenceIndex = 0;

          const cleanup = () => {
            ws.removeEventListener('message', onMessage);
          };

          const fail = (error: unknown) => {
            cleanup();

            if (!settled) {
              settled = true;
              reject(
                error instanceof Error
                  ? error
                  : new Error(String(error))
              );
            }
          };

          const finish = () => {
            cleanup();

            if (!settled) {
              settled = true;
              resolve();
            }
          };

          const onMessage = async (event: MessageEvent) => {
            let msg: any;

            try {
              msg =
                typeof event.data === 'string'
                  ? JSON.parse(event.data)
                  : event.data;
            } catch {
              return;
            }

            const payload = msg?.payload || {};

            // Ignore messages belonging to another command
            if (
              payload.commandId &&
              payload.commandId !== token.commandId
            ) {
              return;
            }

            if (
              activeReplyCommandRef.current !== token.commandId
            ) {
              return;
            }

            if (msg.type === 'INSTANT_ACK') {
              const ackText = String(payload.ackText || '').trim();

              if (ackText) {
                setMessages((prev) => [
                  ...prev,
                  {
                    id: generateMessageId('msg-ack'),
                    sender: 'jarvis',
                    text: ackText,
                    timestamp: Date.now(),
                    intent: 'INSTANT_ACK',
                  },
                ]);

                if (
                  !speechMutedRef.current &&
                  !ttsStarted
                ) {
                  ttsStarted = true;
                  setIsSpeaking(true);
                  globalVoicePipelineGuard.setPhase(
                    'VOICE_RESPONSE'
                  );

                  try {
                    ttsSessionId =
                      await globalTTSProvider.startStreamingSession(
                        {
                          profile: voiceProfileRef.current,
                          language: languageModeRef.current,
                        },
                        query
                      );

                    if (ttsSessionId) {
                      streamingSessionIdRef.current =
                        ttsSessionId;

                      await globalTTSProvider.enqueueChunk(
                        ttsSessionId,
                        ackText,
                        false
                      );
                    }
                  } catch (error) {
                    console.warn(
                      '[InstantReply] ACK TTS failed:',
                      error
                    );
                  }
                }
              }

              return;
            }

            if (msg.type === 'AI_STREAM_START') {
              globalVoicePipelineGuard.setPhase(
                'VOICE_RESPONSE'
              );

              const engineMode =
                payload.engineMode ||
                payload.model ||
                'JARVIS';

              setAiEngineStatus((previous) => ({
                ...previous,
                mode:
                  engineMode === 'SOVEREIGN_EDGE_FAILOVER' ||
                  engineMode === 'SOVEREIGN_EDGE_BRAIN'
                    ? 'Sovereign Edge Brain'
                    : previous.mode,
                isEdgeFailover:
                  engineMode === 'SOVEREIGN_EDGE_FAILOVER' ||
                  engineMode === 'SOVEREIGN_EDGE_BRAIN',
              }));

              return;
            }

            if (msg.type === 'AI_STREAM_SENTENCE') {
              const sentence = String(
                payload.sentence || ''
              ).trim();

              if (!sentence) {
                return;
              }

              sentenceIndex += 1;
              fullText = fullText
                ? `${fullText} ${sentence}`
                : sentence;

              streamingTextRef.current = fullText;

              // Progressive UI — message appears immediately
              if (!replyMessageCreated) {
                const newId = generateMessageId(
                  'msg-jarvis-stream'
                );

                streamingMessageIdRef.current = newId;
                replyMessageCreated = true;

                setMessages((prev) => [
                  ...prev,
                  {
                    id: newId,
                    sender: 'jarvis',
                    text: sentence,
                    timestamp: Date.now(),
                    intent: payload.detectedIntent,
                    engineMode: payload.engineMode,
                    toolsUsed: payload.executedTools,
                  },
                ]);
              } else {
                const messageId =
                  streamingMessageIdRef.current;

                setMessages((prev) =>
                  prev.map((message) =>
                    message.id === messageId
                      ? {
                          ...message,
                          text: fullText,
                        }
                      : message
                  )
                );
              }

              // Sentence-by-sentence TTS
              if (!speechMutedRef.current) {
                try {
                  if (!ttsStarted) {
                    ttsStarted = true;
                    setIsSpeaking(true);

                    globalVoicePipelineGuard.setPhase(
                      'VOICE_RESPONSE'
                    );

                    ttsSessionId =
                      await globalTTSProvider.startStreamingSession(
                        {
                          profile: voiceProfileRef.current,
                          language: languageModeRef.current,
                        },
                        query
                      );

                    if (ttsSessionId) {
                      streamingSessionIdRef.current =
                        ttsSessionId;
                    }
                  }

                  if (ttsSessionId) {
                    await globalTTSProvider.enqueueChunk(
                      ttsSessionId,
                      sentence,
                      Boolean(payload.isFinal)
                    );
                  }
                } catch (error) {
                  console.warn(
                    '[InstantReply] Streaming TTS chunk failed:',
                    error
                  );
                }
              }

              return;
            }

            if (msg.type === 'AI_STREAM_END') {
              const finalText =
                String(payload.fullText || fullText).trim();

              if (finalText) {
                const messageId =
                  streamingMessageIdRef.current;

                if (messageId) {
                  setMessages((prev) =>
                    prev.map((message) =>
                      message.id === messageId
                        ? {
                            ...message,
                            text: finalText,
                            intent:
                              payload.detectedIntent ||
                              message.intent,
                            engineMode:
                              payload.engineMode ||
                              message.engineMode,
                            toolsUsed:
                              payload.executedTools ||
                              message.toolsUsed,
                          }
                        : message
                    )
                  );
                }
              }

              if (ttsSessionId) {
                try {
                  await globalTTSProvider.finishStreamingSession(
                    ttsSessionId
                  );
                } catch (error) {
                  console.warn(
                    '[InstantReply] TTS session finish failed:',
                    error
                  );
                }
              }

              setIsSpeaking(false);
              setIsLoadingReply(false);

              activeReplyCommandRef.current = null;
              activeReplyTokenRef.current = null;
              streamingSessionIdRef.current = null;
              streamingMessageIdRef.current = null;
              streamingTextRef.current = '';

              globalVoicePipelineGuard.releaseExecution(
                token.executionId,
                true
              );

              isSendingRef.current = false;
              globalVoicePipelineGuard.resetToStandby();

              finish();
              return;
            }

            if (msg.type === 'ERROR_REPORT') {
              fail(
                new Error(
                  payload.message ||
                    payload.code ||
                    'JARVIS streaming error'
                )
              );
            }
          };

          ws.addEventListener('message', onMessage);

          try {
            ws.send(
              JSON.stringify({
                type: 'INSTANT_REPLY_REQUEST',
                id: generateMessageId('instant'),
                timestamp: Date.now(),
                payload: {
                  query,
                  commandId: token.commandId,
                  requestId: token.requestId,
                  executionId: token.executionId,
                  mode: 'AUTO',
                  language: languageModeRef.current,
                  voiceProfile: voiceProfileRef.current,
                  sttTimestamp: Date.now(),
                  imageData: sentImage || undefined,
                },
              })
            );
          } catch (sendError) {
            fail(sendError);
          }
        });

        return;
      }

      /*
       * FALLBACK:
       * If WebSocket is unavailable, use the existing HTTP endpoint.
       * This preserves compatibility with the current backend.
       */
      const res = await fetch('/api/jarvis/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompt: query,
          commandId: token.commandId,
          requestId: token.requestId,
          executionId: token.executionId,
          language: languageModeRef.current,
          voiceProfile: voiceProfileRef.current,
          imageData: sentImage || undefined,
        }),
      });

      if (!res.ok) {
        throw new Error(
          `JARVIS HTTP request failed: ${res.status}`
        );
      }

      const data = await res.json();

      const botReply =
        data.reply ||
        (data.error
          ? `Notice: ${data.error}`
          : 'Request executed, Mursaleen.');

      const botMessage: ChatMessage = {
        id: generateMessageId('msg-jarvis'),
        sender: 'jarvis',
        text: botReply,
        timestamp: Date.now(),
        intent: data.detectedIntent,
        toolsUsed: data.executedTools,
        engineMode: data.engineMode,
        quotaWarning: data.quotaWarning,
      };

      setMessages((prev) => [...prev, botMessage]);

      await speakText(botReply, query);

      globalVoicePipelineGuard.releaseExecution(
        token.executionId,
        true
      );
    } catch (e: unknown) {
      console.error('[InstantReply] Chat error:', e);

      globalTTSProvider.cancel();

      setIsSpeaking(false);
      setIsLoadingReply(false);
      isSendingRef.current = false;

      activeReplyCommandRef.current = null;
      activeReplyTokenRef.current = null;
      streamingSessionIdRef.current = null;

      globalVoicePipelineGuard.releaseExecution(
        token.executionId,
        false
      );

      globalVoicePipelineGuard.resetToStandby();

      setMessages((prev) => [
        ...prev,
        {
          id: generateMessageId('msg-err'),
          sender: 'system',
          text:
            e instanceof Error
              ? `JARVIS error: ${e.message}`
              : 'Error communicating with JARVIS brain. Check server logs.',
          timestamp: Date.now(),
        },
      ]);
    }
  };

  handleSendMessageRef.current = handleSendMessage;
