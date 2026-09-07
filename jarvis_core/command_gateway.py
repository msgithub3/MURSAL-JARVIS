"""
Global Command Execution Gateway & State Machine
Guarantees ONE voice command -> ONE transcript -> ONE intent -> ONE tool execution -> ONE response.
Prevents duplicate dispatches, concurrent collisions, and conflicting state transitions.
"""

import time
import uuid
import threading
import hashlib
from typing import Dict, Any, Optional, Tuple
from enum import Enum
from .logger import logger

class AssistantState(str, Enum):
    STANDBY = "STANDBY"
    LISTENING = "LISTENING"
    PROCESSING = "PROCESSING"
    EXECUTING = "EXECUTING"
    SPEAKING = "SPEAKING"
    ERROR = "ERROR"

class VoicePipelinePhase(str, Enum):
    STANDBY = "STANDBY"
    WAKE_WORD_DETECTED = "WAKE_WORD_DETECTED"
    LISTENING = "LISTENING"
    TRANSCRIBING = "TRANSCRIBING"
    COMMAND_DETECTED = "COMMAND_DETECTED"
    INTENT_ANALYSIS = "INTENT_ANALYSIS"
    PLANNING = "PLANNING"
    TOOL_EXECUTION = "TOOL_EXECUTION"
    RESULT = "RESULT"
    VOICE_RESPONSE = "VOICE_RESPONSE"

class CommandExecutionGuard:
    def __init__(self, deduplication_window_seconds: float = 3.0):
        self._lock = threading.RLock()
        self.deduplication_window = deduplication_window_seconds
        
        # State machine single source of truth
        self.current_state = AssistantState.STANDBY
        self.current_phase = VoicePipelinePhase.STANDBY
        
        # Execution tracking and idempotency cache
        self.active_execution_id: Optional[str] = None
        self.active_command_hash: Optional[str] = None
        self.execution_start_time: float = 0.0
        
        # History of processed commands: hash -> (command_id, timestamp, result)
        self.processed_history: Dict[str, Tuple[str, float, Any]] = {}
        
        # Monotonic sequence counter
        self._seq = 0

    def get_state(self) -> Dict[str, Any]:
        with self._lock:
            return {
                "assistant_state": self.current_state.value,
                "pipeline_phase": self.current_phase.value,
                "active_execution_id": self.active_execution_id,
                "is_busy": self.active_execution_id is not None,
                "timestamp": time.time()
            }

    def set_phase(self, phase: VoicePipelinePhase) -> None:
        with self._lock:
            self.current_phase = phase
            if phase in (VoicePipelinePhase.STANDBY,):
                self.current_state = AssistantState.STANDBY
            elif phase in (VoicePipelinePhase.WAKE_WORD_DETECTED, VoicePipelinePhase.LISTENING):
                self.current_state = AssistantState.LISTENING
            elif phase in (VoicePipelinePhase.TRANSCRIBING, VoicePipelinePhase.COMMAND_DETECTED,
                           VoicePipelinePhase.INTENT_ANALYSIS, VoicePipelinePhase.PLANNING):
                self.current_state = AssistantState.PROCESSING
            elif phase in (VoicePipelinePhase.TOOL_EXECUTION, VoicePipelinePhase.RESULT):
                self.current_state = AssistantState.EXECUTING
            elif phase in (VoicePipelinePhase.VOICE_RESPONSE,):
                self.current_state = AssistantState.SPEAKING
            logger.voice(f"State transition: {self.current_state.value} (Phase: {self.current_phase.value})")

    def _normalize_text(self, text: str) -> str:
        """Strip punctuation, excessive spacing and wake phrases for fingerprinting."""
        cleaned = text.lower().strip()
        for wake in ("hey jarvis", "wake up jarvis", "hey mursal", "hello jarvis", "jarvis"):
            cleaned = cleaned.replace(wake, "")
        return " ".join(cleaned.split())

    def _generate_command_hash(self, text: str, user_id: str = "mursaleen") -> str:
        normalized = self._normalize_text(text)
        return hashlib.sha256(f"{user_id}:{normalized}".encode("utf-8")).hexdigest()

    def acquire_execution(
        self,
        raw_text: str,
        command_id: Optional[str] = None,
        request_id: Optional[str] = None
    ) -> Tuple[bool, Optional[str], Optional[str], Optional[Dict[str, Any]]]:
        """
        Attempts to acquire an execution lock for a command.
        Returns:
            (can_execute, execution_id, rejection_reason, cached_result)
        """
        with self._lock:
            now = time.time()
            self._seq += 1
            cmd_id = command_id or f"cmd-{int(now * 1000)}-{self._seq}"
            req_id = request_id or f"req-{uuid.uuid4().hex[:8]}"
            cmd_hash = self._generate_command_hash(raw_text)

            # 1. Clean up stale processed history (> 1 hour)
            stale_keys = [k for k, (_, ts, _) in self.processed_history.items() if now - ts > 3600]
            for k in stale_keys:
                del self.processed_history[k]

            # 2. Check if identical command was processed recently within deduplication window
            if cmd_hash in self.processed_history:
                last_id, last_ts, cached_res = self.processed_history[cmd_hash]
                time_diff = now - last_ts
                if time_diff < self.deduplication_window:
                    logger.command(f"BLOCKED DUPLICATE: '{raw_text}' matched recent command {last_id} ({time_diff:.2f}s ago)")
                    return False, None, f"DUPLICATE_SUPPRESSED: Command processed {time_diff:.2f}s ago", cached_res

            # 3. Check if currently executing this exact command
            if self.active_execution_id is not None:
                if self.active_command_hash == cmd_hash:
                    logger.command(f"BLOCKED CONCURRENT DUPLICATE: Execution in flight for '{raw_text}'")
                    return False, None, "IN_FLIGHT_DUPLICATE: Identical command is already executing", None
                # Auto-release hung execution locks (> 15 seconds)
                if now - self.execution_start_time > 15.0:
                    logger.self_heal(f"Released expired execution lock {self.active_execution_id} after {now - self.execution_start_time:.1f}s")
                    self.active_execution_id = None
                else:
                    logger.command(f"QUEUED/REJECTED: Assistant busy executing {self.active_execution_id}")
                    return False, None, "BUSY: Assistant is currently executing another task", None

            # 4. Grant execution lock
            execution_id = f"exec-{uuid.uuid4().hex[:12]}"
            self.active_execution_id = execution_id
            self.active_command_hash = cmd_hash
            self.execution_start_time = now
            self.set_phase(VoicePipelinePhase.COMMAND_DETECTED)
            logger.command(f"LOCKED & DISPATCHED: id={cmd_id}, req={req_id}, exec={execution_id}, text='{raw_text}'")
            return True, execution_id, None, None

    def release_execution(self, execution_id: str, result: Any) -> None:
        """Release execution lock and register command in idempotency cache."""
        with self._lock:
            if self.active_execution_id == execution_id:
                now = time.time()
                if self.active_command_hash:
                    self.processed_history[self.active_command_hash] = (execution_id, now, result)
                self.active_execution_id = None
                self.active_command_hash = None
                self.set_phase(VoicePipelinePhase.VOICE_RESPONSE)
                logger.command(f"RELEASED & CACHED: exec={execution_id} in {time.time() - self.execution_start_time:.3f}s")
            else:
                logger.error(f"Attempted to release unknown or non-active execution {execution_id}")

    def reset_to_standby(self) -> None:
        with self._lock:
            self.active_execution_id = None
            self.active_command_hash = None
            self.set_phase(VoicePipelinePhase.STANDBY)

global_execution_guard = CommandExecutionGuard()
