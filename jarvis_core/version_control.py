"""
Version Control & Rollback Management for MURSAL JARVIS
Maintains immutable rollback checkpoints, semantic version history, and release changelog.
"""

import time
import shutil
import os
from typing import Dict, Any, List, Optional
from .logger import logger

class RollbackCheckpoint:
    def __init__(self, version: str, description: str, snapshot_id: str, files_snapshot: Dict[str, str]):
        self.version = version
        self.description = description
        self.snapshot_id = snapshot_id
        self.timestamp = time.time()
        self.files_snapshot = files_snapshot

    def to_dict(self) -> Dict[str, Any]:
        return {
            "version": self.version,
            "description": self.description,
            "snapshot_id": self.snapshot_id,
            "timestamp": self.timestamp,
            "file_count": len(self.files_snapshot)
        }

class VersionControlManager:
    def __init__(self):
        self.current_version = "3.1.0"
        self.checkpoints: List[RollbackCheckpoint] = []
        self.changelog: List[Dict[str, Any]] = []
        self._init_baseline()

    def _init_baseline(self):
        self.changelog.append({
            "version": "3.1.0",
            "timestamp": time.time(),
            "summary": "Stabilized Voice Pipeline with Singleton Lifecycle Guard, Python JARVIS Core orchestration, 20 modular tools, and Multi-Layer Memory.",
            "changes": [
                "Resolved duplicate voice message bug via Global Command Execution Guard",
                "Created decoupled Python JARVIS Core orchestration engine",
                "Integrated 20 modular tools with risk boundaries and confirmation policies",
                "Built continuous self-diagnostics with /health, /models, /devices, /diagnostics",
                "Added controlled self-improvement and automated rollback loops"
            ]
        })
        self.create_checkpoint(
            description="Baseline v3.1.0 release checkpoint",
            target_files=["jarvis_core/command_gateway.py", "jarvis_core/tool_registry.py"]
        )

    def create_checkpoint(self, description: str, target_files: List[str]) -> str:
        snapshot_id = f"chk-{int(time.time()*1000)}"
        file_data = {}
        for f in target_files:
            if os.path.exists(f):
                try:
                    with open(f, "r", encoding="utf-8") as fp:
                        file_data[f] = fp.read()
                except Exception as e:
                    logger.error(f"Could not read {f} for checkpoint: {e}")

        chk = RollbackCheckpoint(self.current_version, description, snapshot_id, file_data)
        self.checkpoints.insert(0, chk)
        if len(self.checkpoints) > 10:
            self.checkpoints.pop()
        logger.update(f"Created rollback checkpoint '{snapshot_id}' for {self.current_version}")
        return snapshot_id

    def rollback_to_checkpoint(self, snapshot_id: str) -> Dict[str, Any]:
        target = next((c for c in self.checkpoints if c.snapshot_id == snapshot_id), None)
        if not target:
            return {"success": False, "error": f"Checkpoint '{snapshot_id}' not found"}

        restored_files = []
        for file_path, content in target.files_snapshot.items():
            try:
                with open(file_path, "w", encoding="utf-8") as fp:
                    fp.write(content)
                restored_files.append(file_path)
            except Exception as e:
                logger.error(f"Failed to restore {file_path}: {e}")

        logger.self_heal(f"Rolled back to checkpoint {snapshot_id} ({len(restored_files)} files restored)")
        return {
            "success": True,
            "snapshot_id": snapshot_id,
            "version": target.version,
            "restored_files": restored_files
        }

    def list_checkpoints(self) -> List[Dict[str, Any]]:
        return [c.to_dict() for c in self.checkpoints]

    def list_changelog(self) -> List[Dict[str, Any]]:
        return self.changelog

global_version_manager = VersionControlManager()
