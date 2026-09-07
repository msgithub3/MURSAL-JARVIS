#!/usr/bin/env python3
"""
MURSAL JARVIS — Test Suite: Command Gateway & Zero-Deduplication Guard
Tests command parsing, deduplication windows, monotonic token acquisition, and voice pipeline states.
"""
import unittest
import sys
import os

# Add root and jarvis_core to sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from jarvis_core.command_gateway import CommandExecutionGuard, VoicePipelinePhase
from jarvis_core.intent_planner import IntentPlanner
from jarvis_core.tool_registry import ToolRegistry, RiskLevel


class TestCommandGatewayAndGuard(unittest.TestCase):
    def setUp(self):
        self.guard = CommandExecutionGuard()
        self.planner = IntentPlanner()
        self.tools = ToolRegistry()

    def test_single_command_acquisition(self):
        """Test standard acquisition of a fresh command."""
        acquired, exec_id, reason, cached = self.guard.acquire_execution(
            raw_text="check device status",
            command_id="cmd-test-1",
            request_id="req-test-1"
        )
        self.assertTrue(acquired, f"Expected acquisition to succeed, got reason: {reason}")
        self.assertIsNotNone(exec_id)
        self.assertIsNone(reason)

    def test_rapid_duplicate_command_blocking(self):
        """Test that duplicate commands within the 3.0s window are strictly blocked."""
        # First execution
        acq1, id1, _, _ = self.guard.acquire_execution(
            raw_text="where is my phone",
            command_id="cmd-ring-10"
        )
        self.assertTrue(acq1)

        # Release first execution with a mock result
        self.guard.release_execution(
            execution_id=id1,
            result={"voice_reply": "Beacon activated"}
        )

        # Immediate second invocation of the same command
        acq2, id2, reason2, cached2 = self.guard.acquire_execution(
            raw_text="where is my phone",
            command_id="cmd-ring-10"
        )
        self.assertFalse(acq2, "Expected duplicate command to be suppressed")
        self.assertIn("DUPLICATE", reason2)
        self.assertIsNotNone(cached2)
        self.assertEqual(cached2.get("voice_reply"), "Beacon activated")

    def test_intent_planner_wifi_control(self):
        """Test Pakistani multilingual intent parsing for Wi-Fi."""
        plan = self.planner.parse_intent("wifi band kar do")
        self.assertEqual(plan.get("tool"), "wifi_control")
        self.assertEqual(plan.get("params", {}).get("enabled"), False)

    def test_intent_planner_find_device(self):
        """Test intent parsing for find phone."""
        plan = self.planner.parse_intent("phone dhoondo")
        self.assertEqual(plan.get("tool"), "find_device")

    def test_tool_safety_risk_levels(self):
        """Test that high-risk tools require explicit confirmation."""
        lock_tool = self.tools.get_tool("lock_device")
        self.assertIsNotNone(lock_tool)
        self.assertEqual(lock_tool.risk_level, RiskLevel.HIGH_RISK)

        # Test execution without confirmation
        res = self.tools.execute("lock_device", params={}, confirmed=False)
        self.assertFalse(res.get("success", True))
        self.assertTrue(res.get("requires_confirmation"))

    def test_safe_tool_auto_execution(self):
        """Test that low-risk read-only tools execute without blocking confirmation."""
        res = self.tools.execute("device_status", params={}, confirmed=False)
        self.assertTrue(res.get("success"))
        self.assertIn("battery", res)


if __name__ == "__main__":
    unittest.main()
