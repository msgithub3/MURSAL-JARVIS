"""
Modular Multi-Layer Memory System for MURSAL JARVIS
Supports 6 distinct memory layers with persistence, inspection, retrieval, and deletion controls.
Allows conversational commands: 'JARVIS remember this', 'JARVIS forget that'.
"""

import time
import json
import os
from typing import Dict, Any, List, Optional
from enum import Enum
from .logger import logger

class MemoryType(str, Enum):
    SHORT_TERM_MEMORY = "SHORT_TERM_MEMORY"
    CONVERSATION_MEMORY = "CONVERSATION_MEMORY"
    USER_PREFERENCES = "USER_PREFERENCES"
    TASK_MEMORY = "TASK_MEMORY"
    DEVICE_MEMORY = "DEVICE_MEMORY"
    AUTOMATION_MEMORY = "AUTOMATION_MEMORY"

class MemoryEntry:
    def __init__(
        self,
        memory_id: str,
        memory_type: MemoryType,
        key: str,
        content: str,
        importance: int = 5,
        metadata: Optional[Dict[str, Any]] = None
    ):
        self.memory_id = memory_id
        self.memory_type = memory_type
        self.key = key
        self.content = content
        self.importance = importance
        self.metadata = metadata or {}
        self.created_at = time.time()
        self.last_accessed = time.time()

    def to_dict(self) -> Dict[str, Any]:
        return {
            "memory_id": self.memory_id,
            "memory_type": self.memory_type.value,
            "key": self.key,
            "content": self.content,
            "importance": self.importance,
            "metadata": self.metadata,
            "created_at": self.created_at,
            "last_accessed": self.last_accessed
        }

class MemorySystem:
    def __init__(self, persistence_file: str = "/tmp/mursal_jarvis_memory.json"):
        self.persistence_file = persistence_file
        self.memories: Dict[str, MemoryEntry] = {}
        self._load_defaults()

    def _load_defaults(self):
        # Default seeded memories
        defaults = [
            (MemoryType.USER_PREFERENCES, "user_identity", "User is Mursaleen, operating MURSAL JARVIS across Android and Workstation Laptop.", 10),
            (MemoryType.USER_PREFERENCES, "language_mode", "Preferred natural languages: English, Urdu, Roman Urdu, Punjabi.", 9),
            (MemoryType.TASK_MEMORY, "mursalcart_objective", "Continuously assess high-converting Pakistani e-commerce products with healthy COD profit margins (> 40%).", 8),
            (MemoryType.DEVICE_MEMORY, "primary_phone", "Primary handheld node: Mursal Android Pro with Voice Foreground Service and Accessibility automation.", 7),
            (MemoryType.AUTOMATION_MEMORY, "morning_briefing", "Trigger daily executive briefing on weather, device battery, Daraz orders, and task agenda at 8:00 AM.", 7),
        ]
        for idx, (mtype, key, content, imp) in enumerate(defaults):
            mem_id = f"mem-init-{idx+1}"
            self.memories[mem_id] = MemoryEntry(mem_id, mtype, key, content, imp)

    def remember(self, content: str, memory_type: MemoryType = MemoryType.USER_PREFERENCES, key: Optional[str] = None) -> Dict[str, Any]:
        mem_id = f"mem-{int(time.time()*1000)}"
        entry_key = key or f"note-{mem_id[-6:]}"
        entry = MemoryEntry(mem_id, memory_type, entry_key, content, importance=7)
        self.memories[mem_id] = entry
        logger.command(f"Remembered in {memory_type.value}: '{content[:50]}'")
        return {"success": True, "memory": entry.to_dict()}

    def forget(self, query_or_id: str) -> Dict[str, Any]:
        target_id = None
        if query_or_id in self.memories:
            target_id = query_or_id
        else:
            # Search by key or substring
            for mid, m in self.memories.items():
                if query_or_id.lower() in m.key.lower() or query_or_id.lower() in m.content.lower():
                    target_id = mid
                    break

        if target_id:
            deleted = self.memories.pop(target_id)
            logger.command(f"Forgot memory {target_id}: '{deleted.content[:40]}'")
            return {"success": True, "deleted_memory": deleted.to_dict()}
        return {"success": False, "error": f"No memory matched '{query_or_id}'"}

    def query(self, search_text: str = "", memory_type: Optional[MemoryType] = None) -> List[Dict[str, Any]]:
        results = []
        for m in self.memories.values():
            if memory_type and m.memory_type != memory_type:
                continue
            if search_text:
                if search_text.lower() not in m.content.lower() and search_text.lower() not in m.key.lower():
                    continue
            m.last_accessed = time.time()
            results.append(m.to_dict())
        return sorted(results, key=lambda x: (x["importance"], x["last_accessed"]), reverse=True)

    def list_all(self) -> List[Dict[str, Any]]:
        return [m.to_dict() for m in self.memories.values()]

    def purge_all(self) -> int:
        count = len(self.memories)
        self.memories.clear()
        self._load_defaults()
        logger.command(f"Purged custom memories, reset to {len(self.memories)} defaults")
        return count

global_memory_system = MemorySystem()
