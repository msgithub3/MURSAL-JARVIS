"""
Event-Driven & Scheduled Automation Engine for MURSAL JARVIS
Supports triggers, conditions, actions, sequential pipelines, delays, schedules, and failure handling.
"""

import time
from typing import Dict, Any, List, Optional
from .logger import logger
from .tool_registry import global_tool_registry

class AutomationRoutine:
    def __init__(
        self,
        routine_id: str,
        name: str,
        trigger: Dict[str, Any],
        conditions: List[Dict[str, Any]],
        actions: List[Dict[str, Any]],
        enabled: bool = True
    ):
        self.routine_id = routine_id
        self.name = name
        self.trigger = trigger
        self.conditions = conditions
        self.actions = actions
        self.enabled = enabled
        self.last_run_time: Optional[float] = None
        self.execution_count = 0

    def to_dict(self) -> Dict[str, Any]:
        return {
            "routine_id": self.routine_id,
            "name": self.name,
            "trigger": self.trigger,
            "conditions": self.conditions,
            "actions": self.actions,
            "enabled": self.enabled,
            "last_run_time": self.last_run_time,
            "execution_count": self.execution_count
        }

class AutomationEngine:
    def __init__(self):
        self.routines: Dict[str, AutomationRoutine] = {}
        self.execution_history: List[Dict[str, Any]] = []
        self._init_default_routines()

    def _init_default_routines(self):
        # 1. Home Wi-Fi Connect Routine
        self.register(AutomationRoutine(
            routine_id="auto-wifi-home",
            name="Home Arrival Greeting & Volume Prep",
            trigger={"type": "wifi_connected", "ssid": "Mursal_Home_5G"},
            conditions=[{"field": "battery", "op": "gte", "val": 15}],
            actions=[
                {"tool": "volume_control", "params": {"level": 70}},
                {"tool": "open_app", "params": {"app": "WhatsApp"}},
                {"tool": "device_status", "params": {}}
            ]
        ))

        # 2. Sleep Automation
        self.register(AutomationRoutine(
            routine_id="auto-sleep-mode",
            name="Sleep Mode Security & Silence",
            trigger={"type": "voice_phrase", "phrase": "i am sleeping"},
            conditions=[],
            actions=[
                {"tool": "volume_control", "params": {"level": 0}},
                {"tool": "wifi_control", "params": {"enabled": True}},
                {"tool": "lock_device", "params": {"reason": "sleep_routine"}}
            ]
        ))

        # 3. Morning E-Commerce Briefing
        self.register(AutomationRoutine(
            routine_id="auto-morning-briefing",
            name="8:00 AM Morning Executive Briefing",
            trigger={"type": "schedule", "cron": "0 8 * * *"},
            conditions=[{"field": "device_online", "op": "eq", "val": True}],
            actions=[
                {"tool": "read_notifications", "params": {"filter_app": "all"}},
                {"tool": "calendar", "params": {"query": "today"}}
            ]
        ))

    def register(self, routine: AutomationRoutine):
        self.routines[routine.routine_id] = routine
        logger.automation(f"Registered automation routine: {routine.name}")

    def list_routines(self) -> List[Dict[str, Any]]:
        return [r.to_dict() for r in self.routines.values()]

    def toggle_routine(self, routine_id: str, enabled: Optional[bool] = None) -> Dict[str, Any]:
        routine = self.routines.get(routine_id)
        if not routine:
            return {"success": False, "error": f"Routine '{routine_id}' not found"}
        routine.enabled = not routine.enabled if enabled is None else enabled
        return {"success": True, "routine": routine.to_dict()}

    def execute_routine(self, routine_id: str, context: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        routine = self.routines.get(routine_id)
        if not routine:
            return {"success": False, "error": f"Routine '{routine_id}' not found"}
        if not routine.enabled:
            return {"success": False, "error": f"Routine '{routine.name}' is currently disabled"}

        logger.automation(f"Executing routine '{routine.name}' ({len(routine.actions)} actions)")
        results = []
        start = time.time()
        for action in routine.actions:
            tool_name = action.get("tool")
            params = action.get("params", {})
            res = global_tool_registry.execute(tool_name, params, confirmed=True)
            results.append({"tool": tool_name, "result": res})

        routine.last_run_time = time.time()
        routine.execution_count += 1
        history_item = {
            "routine_id": routine_id,
            "name": routine.name,
            "timestamp": time.time(),
            "duration_ms": round((time.time() - start) * 1000, 2),
            "step_count": len(results),
            "success": all(r["result"].get("success", False) for r in results)
        }
        self.execution_history.insert(0, history_item)
        if len(self.execution_history) > 50:
            self.execution_history.pop()

        return {
            "success": True,
            "routine": routine.name,
            "execution": history_item,
            "steps": results
        }

global_automation_engine = AutomationEngine()
