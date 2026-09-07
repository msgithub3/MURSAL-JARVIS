export type JarvisPhase =
  | 'STANDBY'
  | 'WAKE_WORD_DETECTED'
  | 'LISTENING_FOR_COMMAND'
  | 'TRANSCRIBING'
  | 'THINKING'
  | 'TOOL_EXECUTION'
  | 'SPEAKING';

export interface InstantReplyMetrics {
  wake_to_stt?: number;
  stt_latency?: number;
  router_latency?: number;
  model_ttft?: number;
  model_total_latency?: number;
  tts_ttfa?: number;
  tts_total_latency?: number;
  device_action_latency?: number;
  total_reply_latency?: number;
  engineMode?: string;
  activeModel?: string;
  isCached?: boolean;
  isBypass?: boolean;
  mode?: 'FAST' | 'DEEP';
}

export interface ChatMessage {
  id: string;
  sender: 'user' | 'jarvis' | 'system';
  text: string;
  image?: string;
  timestamp: number;
  intent?: string;
  toolsUsed?: string[];
  isAudioPlaying?: boolean;
  engineMode?: string;
  quotaWarning?: string;
  instantMetrics?: InstantReplyMetrics;
  mode?: 'FAST' | 'DEEP';
}

export interface MetricItem {
  name: string;
  score: number;
  status: string;
  note: string;
}

export interface SourcingChannel {
  name: string;
  availability: string;
  estimatedCost: string;
  deliveryDays: string;
}

export interface MursalCartEvaluation {
  productName: string;
  category: string;
  platform: string;
  financials: {
    supplierPrice: number;
    shippingCost: number;
    sellingPrice: number;
    grossProfit: number;
    grossMargin: string;
    estimatedReturnRate: string;
    netEstimatedProfitPKR: number;
  };
  overallScore: number;
  recommendation: string;
  metrics: MetricItem[];
  pakistaniSourcingChannels: SourcingChannel[];
}

export interface MeshDevice {
  id: string;
  name: string;
  type: 'android_phone' | 'cloud_server' | 'laptop' | 'tablet';
  status: 'online' | 'standby' | 'disconnected';
  battery: number;
  network: string;
  lastLocation: { lat: number; lng: number; label: string };
  lastHeartbeat: number;
  isLocked: boolean;
}

export interface AuditLog {
  id: string;
  event: string;
  device: string;
  timestamp: number;
  level: string;
}

export interface MemoryRecord {
  id: string;
  type: 'short_term' | 'long_term' | 'task' | 'tool';
  category: string;
  content: string;
  timestamp: number;
}

export type LanguageMode = 'auto' | 'en' | 'ur' | 'ur-Roman' | 'pa' | 'skr' | 'ps' | 'sd';

export type VoiceProfile = 'classic' | 'calm' | 'friendly' | 'professional' | 'energetic' | 'deep';

export type ResponseStyle = 'natural' | 'friendly' | 'professional' | 'concise' | 'detailed';

export interface JarvisSettings {
  languageMode: LanguageMode;
  voiceLanguage: LanguageMode;
  voiceProfile: VoiceProfile;
  responseStyle: ResponseStyle;
  wakeWord: string;
  autoListen: boolean;
  bargeInEnabled: boolean;
  sensitiveActionConfirmation: boolean;
  speechRate: number;
  speechPitch: number;
}

// ==========================================
// 1. REAL-TIME DEVICE STATE TYPES
// ==========================================

export type DeviceConnectionStatus =
  | 'ONLINE'
  | 'OFFLINE'
  | 'CONNECTING'
  | 'DEGRADED'
  | 'PERMISSION_REQUIRED'
  | 'UNAVAILABLE'
  | 'ERROR';

export type MonitoringProfile = 'ECO' | 'BALANCED' | 'REAL-TIME' | 'CUSTOM';

export type ThermalState =
  | 'NONE'
  | 'LIGHT'
  | 'MODERATE'
  | 'SEVERE'
  | 'CRITICAL'
  | 'EMERGENCY'
  | 'SHUTDOWN';

export type OrientationState = 'PORTRAIT' | 'LANDSCAPE' | 'REVERSE_PORTRAIT' | 'REVERSE_LANDSCAPE';

export type AudioModeState =
  | 'NORMAL'
  | 'RINGTONE'
  | 'IN_CALL'
  | 'IN_COMMUNICATION'
  | 'SILENT'
  | 'VIBRATE';

export interface DeviceBatteryState {
  level: number; // 0 - 100
  status: 'CHARGING' | 'DISCHARGING' | 'FULL' | 'NOT_CHARGING' | 'UNKNOWN';
  chargingState: 'AC' | 'USB' | 'WIRELESS' | 'NONE';
  temperatureCelsius: number;
  health: 'GOOD' | 'OVERHEAT' | 'DEAD' | 'OVER_VOLTAGE' | 'UNSPECIFIED_FAILURE';
}

export interface DeviceNetworkState {
  type: 'WIFI' | 'CELLULAR' | 'ETHERNET' | 'BLUETOOTH' | 'VPN' | 'NONE';
  wifiState: 'ENABLED' | 'DISABLED' | 'UNKNOWN';
  wifiSsid?: string;
  wifiBssid?: string;
  wifiRssiDbm?: number;
  wifiLinkSpeedMbps?: number;
  wifiFrequencyMhz?: number;
  mobileNetworkState: 'CONNECTED' | 'CONNECTING' | 'DISCONNECTED' | 'SUSPENDED' | 'UNKNOWN';
  carrierName?: string;
  mobileNetworkType?: '5G' | 'LTE' | 'HSPA' | '3G' | '2G' | 'UNKNOWN';
  internetReachability: boolean;
  ipAddress?: string;
}

export interface DeviceBluetoothState {
  state: 'ON' | 'OFF' | 'TURNING_ON' | 'TURNING_OFF' | 'UNAVAILABLE';
  connectedDevices: string[];
  audioDeviceConnected: boolean;
}

export interface DeviceLocationState {
  state: 'AVAILABLE' | 'DISABLED' | 'PERMISSION_REQUIRED';
  gpsAvailable: boolean;
  latitude?: number;
  longitude?: number;
  accuracyMeters?: number;
  altitudeMeters?: number;
  lastLocationTime?: number;
}

export interface DeviceScreenState {
  isScreenOn: boolean;
  isLocked: boolean;
  isInteractive: boolean;
  orientation: OrientationState;
  rotationDegrees: 0 | 90 | 180 | 270;
  brightness: number; // 0 - 100
}

export interface DeviceAudioState {
  volumeLevels: {
    media: number; // 0 - 100
    ring: number;
    alarm: number;
    call: number;
    notification: number;
  };
  audioMode: AudioModeState;
  headphonesConnected: boolean;
  bluetoothAudioConnected: boolean;
}

export interface DeviceStorageState {
  totalBytes: number;
  availableBytes: number;
  freeBytes: number;
  usedPercentage: number;
}

export interface DeviceMemoryState {
  totalRamMb: number;
  availableRamMb: number;
  thresholdRamMb: number;
  lowMemory: boolean;
  usedPercentage: number;
}

export interface DeviceCpuState {
  coreCount: number;
  cpuUsagePercent: number;
  activeFrequencyMhz?: number;
  governor?: string;
}

export interface DeviceThermalState {
  thermalStatus: ThermalState;
  temperatureCelsius: number;
}

export interface DeviceAppContext {
  foregroundPackage: string;
  foregroundActivity: string;
  appName: string;
  appState: 'FOREGROUND' | 'BACKGROUND' | 'STANDBY';
  lastChangeTimestamp: number;
}

export interface DeviceServicesState {
  jarvisServiceState: 'RUNNING' | 'STOPPED' | 'STARTING' | 'ERROR';
  accessibilityServiceState: 'ENABLED' | 'DISABLED' | 'PERMISSION_REQUIRED' | 'UNAVAILABLE';
  notificationListenerState: 'ENABLED' | 'DISABLED' | 'PERMISSION_REQUIRED';
  mediaProjectionState: 'AUTHORIZED' | 'IDLE' | 'PERMISSION_REQUIRED' | 'STOPPED';
  microphoneState: 'AVAILABLE' | 'RECORDING' | 'MUTED' | 'PERMISSION_REQUIRED';
  cameraState: 'AVAILABLE' | 'IN_USE' | 'PERMISSION_REQUIRED';
}

export interface RealtimeConnectionHealth {
  backendConnection: 'CONNECTED' | 'DISCONNECTED' | 'RECONNECTING';
  websocketConnection: ConnectionState;
  transportType: 'WEBSOCKET' | 'HTTP_SSE_STREAM' | 'OFFLINE';
  lastSyncTime: number;
  lastScreenCaptureTime: number;
  lastEventTime: number;
  telemetryLatencyMs: number;
  screenAnalysisLatencyMs: number;
  aiLatencyMs: number;
  transportLatencyMs: number;
  packetCount: number;
  errorCount: number;
}

export interface DevicePermissionsPolicy {
  readGranted: boolean;
  controlGranted: boolean;
  sensitiveActionsRequireConfirm: boolean;
  allowedControlTools: string[];
}

export interface FullDeviceState {
  deviceId: string;
  deviceName: string;
  model: string;
  manufacturer: string;
  androidVersion: string;
  sdkVersion: number;
  appVersion: string;
  jarvisVersion: string;
  trustStatus: 'TRUSTED' | 'PAIRING' | 'UNTRUSTED' | 'REVOKED';
  sessionToken?: string;
  status: DeviceConnectionStatus;
  monitoringProfile: MonitoringProfile;
  battery: DeviceBatteryState;
  network: DeviceNetworkState;
  bluetooth: DeviceBluetoothState;
  location: DeviceLocationState;
  screen: DeviceScreenState;
  audio: DeviceAudioState;
  storage: DeviceStorageState;
  memory: DeviceMemoryState;
  cpu: DeviceCpuState;
  thermal: DeviceThermalState;
  appContext: DeviceAppContext;
  services: DeviceServicesState;
  connectivity: RealtimeConnectionHealth;
  permissions: DevicePermissionsPolicy;
  lastUpdated: number;
}

// ==========================================
// 2. REAL-TIME EVENT TYPES
// ==========================================

export type RealtimeEventType =
  | 'DEVICE_CONNECTED'
  | 'DEVICE_DISCONNECTED'
  | 'DEVICE_BOOTED'
  | 'DEVICE_SHUTDOWN'
  | 'SCREEN_ON'
  | 'SCREEN_OFF'
  | 'SCREEN_UNLOCKED'
  | 'SCREEN_LOCKED'
  | 'BATTERY_CHANGED'
  | 'CHARGER_CONNECTED'
  | 'CHARGER_DISCONNECTED'
  | 'NETWORK_CHANGED'
  | 'WIFI_CHANGED'
  | 'BLUETOOTH_CHANGED'
  | 'ORIENTATION_CHANGED'
  | 'APP_CHANGED'
  | 'FOREGROUND_APP_CHANGED'
  | 'NOTIFICATION_RECEIVED'
  | 'NOTIFICATION_REMOVED'
  | 'CALL_STATE_CHANGED'
  | 'MEDIA_STATE_CHANGED'
  | 'LOCATION_STATE_CHANGED'
  | 'JARVIS_SERVICE_STARTED'
  | 'JARVIS_SERVICE_STOPPED'
  | 'WEBSOCKET_CONNECTED'
  | 'WEBSOCKET_DISCONNECTED'
  | 'WEBSOCKET_ERROR'
  | 'SCREEN_CAPTURE_STARTED'
  | 'SCREEN_CAPTURE_STOPPED'
  | 'SCREEN_FRAME_AVAILABLE'
  | 'ACCESSIBILITY_EVENT'
  | 'VOICE_COMMAND_RECEIVED'
  | 'VOICE_COMMAND_STARTED'
  | 'VOICE_COMMAND_COMPLETED'
  | 'VOICE_COMMAND_FAILED';

export type EventPriority = 'CRITICAL' | 'HIGH' | 'NORMAL' | 'LOW';
export type EventPrivacyLevel = 'PUBLIC' | 'DEVICE_ONLY' | 'SENSITIVE_REDACTED' | 'CONFIDENTIAL';

export interface RealtimeEvent {
  eventId: string;
  eventType: RealtimeEventType;
  timestamp: number;
  deviceId: string;
  source: string;
  priority: EventPriority;
  payload: Record<string, any>;
  privacyLevel: EventPrivacyLevel;
}

// ==========================================
// 3. REAL-TIME SCREEN INTELLIGENCE TYPES
// ==========================================

export interface AccessibleUIElement {
  id: string;
  className?: string;
  packageName: string;
  text: string;
  contentDescription?: string;
  viewIdResourceName?: string;
  bounds: {
    left: number;
    top: number;
    right: number;
    bottom: number;
    width: number;
    height: number;
  };
  isClickable: boolean;
  isEditable: boolean;
  isScrollable: boolean;
  isFocused: boolean;
  isSelected: boolean;
  isEnabled: boolean;
  isPassword?: boolean;
}

export interface RealtimeScreenState {
  timestamp: number;
  frameId: string;
  hash: string;
  visualHash?: string;
  ocrText: string;
  uiElements: AccessibleUIElement[];
  accessibilityTree: Array<{
    nodeId: string;
    className: string;
    text?: string;
    contentDescription?: string;
    viewId?: string;
    isClickable?: boolean;
    bounds?: any;
  }>;
  focusedElement?: AccessibleUIElement;
  foregroundPackage: string;
  foregroundActivity: string;
  changeScore: number; // 0.0 - 1.0
  importantChanges: string[];
  isCapturedWithMediaProjection: boolean;
  isMediaProjectionAuthorized: boolean;
  isPrivacyOverlayActive: boolean;
  privacyRedacted: boolean;
  imageThumbnailUrl?: string;
  screenWidth?: number;
  screenHeight?: number;
}

export interface ScreenActionRequest {
  actionType: 'CLICK' | 'SCROLL_DOWN' | 'SCROLL_UP' | 'TYPE_TEXT' | 'BACK' | 'HOME' | 'OPEN_APP';
  targetElementText?: string;
  targetViewId?: string;
  inputPayload?: string;
  requiresConfirmation?: boolean;
}

export interface ScreenAnalysisResponse {
  answerText: string;
  language: string;
  activeApp: string;
  freshnessMs: number;
  visionModelUsed: string;
  isEdgeFallback: boolean;
  elementsDetectedCount: number;
  suggestedActions?: string[];
  redactedSensitiveFields?: number;
}

// ==========================================
// 4. CONNECTION MANAGER & PRIVACY TYPES
// ==========================================

export type ConnectionState =
  | 'IDLE'
  | 'CONNECTING'
  | 'OPEN'
  | 'CLOSING'
  | 'CLOSED'
  | 'ERROR'
  | 'RECONNECTING';

export type WebSocketErrorCategory =
  | 'NETWORK_FAILURE'
  | 'SERVER_UNAVAILABLE'
  | 'TIMEOUT'
  | 'AUTH_FAILURE'
  | 'INVALID_MESSAGE'
  | 'CLOSED_BEFORE_OPEN'
  | 'INTENTIONAL_DISCONNECT'
  | 'SERVER_REJECTED'
  | 'DUPLICATE_CONNECTION';

export interface WebSocketErrorInfo {
  category: WebSocketErrorCategory;
  message: string;
  code?: number;
  fatal: boolean;
  timestamp: number;
}

export interface ConnectionStatusInfo {
  status: 'CONNECTED' | 'RECONNECTING' | 'DISCONNECTED' | 'FALLBACK';
  connectionState?: ConnectionState;
  transport: 'WEBSOCKET' | 'HTTP_SSE_STREAM';
  pingLatencyMs: number;
  messagesSent: number;
  messagesReceived: number;
  currentBackoffMs: number;
  reconnectAttempts?: number;
  lastError?: WebSocketErrorInfo | null;
}

export interface PrivacySettings {
  SCREEN_SHARING_ENABLED: boolean;
  SCREEN_ANALYSIS_ENABLED: boolean;
  ACCESSIBILITY_ENABLED: boolean;
  NOTIFICATION_READING_ENABLED: boolean;
  CLOUD_SCREEN_UPLOAD_ENABLED: boolean;
  LOCAL_ONLY_MODE: boolean;
  autoRedactPasswordsAndPins?: boolean;
  localProcessingOnly?: boolean;
}

export interface CommandQueueItem {
  commandId: string;
  rawText: string;
  timestamp: number;
  priority: 'NORMAL' | 'HIGH' | 'INTERRUPT';
  status: 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'CANCELLED' | 'FAILED';
  error?: string;
  durationMs?: number;
}

export interface ModelRoutingReport {
  taskType: 'VISION_SCREEN' | 'VOICE_CHAT' | 'TOOL_DECISION' | 'LOCAL_SUMMARY';
  primaryModel: string;
  fallbackModel: string;
  selectedModel: string;
  failureReason?: string;
  fallbackStatus: 'NOT_NEEDED' | 'RETRY_SUCCEEDED' | 'EDGE_FAILOVER_ACTIVE' | 'OFFLINE_LOCAL';
  latencyMs: number;
  timestamp: number;
}

export type VoiceStateMachineState =
  | 'IDLE'
  | 'LISTENING'
  | 'TRANSCRIBING'
  | 'THINKING'
  | 'PREPARING_SPEECH'
  | 'SPEAKING'
  | 'INTERRUPTED'
  | 'COMPLETED'
  | 'ERROR';

export type ModelHealthStatus =
  | 'ONLINE'
  | 'DEGRADED'
  | 'RATE_LIMITED'
  | 'UNAVAILABLE'
  | 'OFFLINE'
  | 'UNKNOWN'
  | 'COOLDOWN';

export interface JarvisCentralContext {
  deviceState: FullDeviceState;
  screenState: RealtimeScreenState;
  voiceState: VoiceStateMachineState;
  activePackage: string;
  activeActivity?: string;
  currentCommand: CommandQueueItem | null;
  activeAIModel: string;
  connectionState: ConnectionStatusInfo;
  recentEvents: RealtimeEvent[];
  lastUpdated: number;
}


