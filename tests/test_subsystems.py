#!/usr/bin/env python3
"""
MURSAL JARVIS — Test Suite: Subsystems & Controlled Self-Improvement
Tests Memory, Automation, Recommendations, Proposals, and Checkpoint Versioning.
"""
import unittest
import sys
import os

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from jarvis_core.memory_system import MemorySystem, MemoryType
from jarvis_core.automation_engine import AutomationEngine
from jarvis_core.recommendation_engine import RecommendationEngine
from jarvis_core.self_improvement import SelfImprovementEngine
from jarvis_core.version_control import VersionControlManager
from jarvis_core.self_diagnostics import SelfDiagnostics


class TestSubsystems(unittest.TestCase):
    def test_memory_indexing_and_search(self):
        mem = MemorySystem()
        res = mem.remember(
            content="User prefers Urdu and Roman Urdu audio feedback",
            memory_type=MemoryType.USER_PREFERENCES,
            key="user_lang"
        )
        self.assertTrue(res.get("success"))
        results = mem.query(search_text="Urdu")
        self.assertGreater(len(results), 0)

    def test_recommendation_engine(self):
        rec_eng = RecommendationEngine()
        recs = rec_eng.list_recommendations()
        self.assertGreater(len(recs), 0)
        has_rec = any(len(r.get("problem", "")) > 0 for r in recs)
        self.assertTrue(has_rec)

    def test_self_improvement_safety_validation(self):
        si = SelfImprovementEngine()
        # Proposal with destructive command should fail safety audit
        res = si.propose_patch(
            title="Dangerous proposal",
            diagnosis="testing audit",
            target_file="test.py",
            patch_diff="import os; os.system('rm -rf /')"
        )
        self.assertFalse(res.get("safety_audit", {}).get("passed", True))
        self.assertIn("rm -rf", str(res.get("safety_audit", {}).get("forbidden_keywords_found", [])))

    def test_version_checkpoint_creation(self):
        vm = VersionControlManager()
        snap_id = vm.create_checkpoint(
            description="Test baseline checkpoint",
            target_files=["jarvis_core/command_gateway.py"]
        )
        self.assertTrue(snap_id.startswith("chk-"))
        checkpoints = vm.list_checkpoints()
        self.assertTrue(any(c["snapshot_id"] == snap_id for c in checkpoints))

    def test_comprehensive_diagnostics(self):
        diag = SelfDiagnostics()
        report = diag.run_comprehensive_diagnostics()
        self.assertEqual(report.get("overall_status"), "PASS")
        self.assertGreater(len(report.get("diagnostic_checks", [])), 3)


if __name__ == "__main__":
    unittest.main()
