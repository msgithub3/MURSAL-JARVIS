#!/usr/bin/env python3
"""
MURSAL JARVIS — Unified Self-Testing Runner
Runs all unit and integration test suites.
"""
import unittest
import sys
import os

if __name__ == "__main__":
    suite = unittest.defaultTestLoader.discover(os.path.dirname(__file__), pattern="test_*.py")
    runner = unittest.TextTestRunner(verbosity=2)
    result = runner.run(suite)
    sys.exit(0 if result.wasSuccessful() else 1)
