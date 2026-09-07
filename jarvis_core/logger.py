"""
Structured Logging Module for MURSAL JARVIS
Supports category tags [VOICE], [COMMAND], [INTENT], [TOOL], [DEVICE],
[GEMINI], [AUTOMATION], [ERROR], [SELF-HEAL], [UPDATE].
Never logs secrets or sensitive credentials.
"""

import sys
import time
import re

SENSITIVE_PATTERNS = [
    re.compile(r'(?i)(api[_-]?key|secret|password|bearer|token)\s*[:=]\s*["\']?([^"\'\s]+)["\']?'),
    re.compile(r'(AIzaSy[A-Za-z0-9_-]{33})'),
]

def mask_sensitive_data(message: str) -> str:
    """Mask credentials and tokens to prevent accidental log leakage."""
    cleaned = message
    for pattern in SENSITIVE_PATTERNS:
        cleaned = pattern.sub(r'\1: [REDACTED_SECRET]', cleaned)
    return cleaned

class JarvisLogger:
    def __init__(self, component: str = "JARVIS_CORE"):
        self.component = component

    def _log(self, tag: str, message: str, level: str = "INFO"):
        safe_msg = mask_sensitive_data(str(message))
        timestamp = time.strftime("%Y-%m-%d %H:%M:%S")
        output = f"[{timestamp}] [{tag}] [{level}] {safe_msg}"
        if level == "ERROR":
            print(f"\033[91m{output}\033[0m", file=sys.stderr)
        elif level == "WARN":
            print(f"\033[93m{output}\033[0m")
        elif level == "SUCCESS":
            print(f"\033[92m{output}\033[0m")
        else:
            print(output)

    def voice(self, message: str): self._log("VOICE", message)
    def command(self, message: str): self._log("COMMAND", message)
    def intent(self, message: str): self._log("INTENT", message)
    def tool(self, message: str): self._log("TOOL", message)
    def device(self, message: str): self._log("DEVICE", message)
    def gemini(self, message: str): self._log("GEMINI", message)
    def automation(self, message: str): self._log("AUTOMATION", message)
    def error(self, message: str, exc: Exception = None):
        if exc:
            message = f"{message} | Exception: {type(exc).__name__}: {exc}"
        self._log("ERROR", message, level="ERROR")
    def self_heal(self, message: str): self._log("SELF-HEAL", message, level="WARN")
    def update(self, message: str): self._log("UPDATE", message, level="SUCCESS")

logger = JarvisLogger()
