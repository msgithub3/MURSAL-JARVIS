"""
Device Mesh Registry & Anti-Loss Recovery Engine
Manages paired devices (Android phone, Workstation Laptop, Cloud Node) with authenticated telemetry,
capability profiles, acoustic locator sirens, and remote protection.
"""

import time
import hmac
import hashlib
from typing import Dict, Any, List, Optional
from .logger import logger

MESH_SHARED_SECRET = b"MURSAL_JARVIS_SOVEREIGN_MESH_2026_KEY"

class MeshDevice:
    def __init__(
        self,
        device_id: str,
        device_name: str,
        platform: str,
        battery: int,
        network: str,
        capabilities: List[str],
        lat: float,
        lng: float,
        location_label: str
    ):
        self.device_id = device_id
        self.device_name = device_name
        self.platform = platform
        self.battery = battery
        self.network = network
        self.capabilities = capabilities
        self.lat = lat
        self.lng = lng
        self.location_label = location_label
        self.online_status = True
        self.last_seen = time.time()
        self.is_locked = False
        self.siren_active = False

    def to_dict(self) -> Dict[str, Any]:
        return {
            "device_id": self.device_id,
            "device_name": self.device_name,
            "platform": self.platform,
            "online_status": self.online_status,
            "battery": self.battery,
            "network": self.network,
            "last_seen": self.last_seen,
            "is_locked": self.is_locked,
            "siren_active": self.siren_active,
            "capabilities": self.capabilities,
            "location": {
                "latitude": self.lat,
                "longitude": self.lng,
                "label": self.location_label
            }
        }

class DeviceRegistry:
    def __init__(self):
        self.devices: Dict[str, MeshDevice] = {}
        self.audit_log: List[Dict[str, Any]] = []
        self._init_default_mesh()

    def _init_default_mesh(self):
        # 1. Android Phone
        self.register(MeshDevice(
            device_id="dev-android-01",
            device_name="Mursal Android Pro",
            platform="Android 15 (ARM64)",
            battery=88,
            network="5G / Wi-Fi 6",
            capabilities=["voice_service", "accessibility", "camera", "flashlight", "volume", "telephony", "notifications"],
            lat=31.5204,
            lng=74.3587,
            location_label="Lahore, Pakistan"
        ))

        # 2. Laptop Workstation
        self.register(MeshDevice(
            device_id="dev-laptop-01",
            device_name="Mursal Workstation Laptop",
            platform="Linux / ChromeOS / Windows",
            battery=96,
            network="Gigabit Ethernet / Wi-Fi 6E",
            capabilities=["terminal_dispatch", "vscode_automation", "browser_vision", "file_indexing", "dev_server"],
            lat=31.5204,
            lng=74.3587,
            location_label="Workstation Station"
        ))

        # 3. Cloud Brain Node
        self.register(MeshDevice(
            device_id="dev-cloud-01",
            device_name="Mursal Cloud Brain Node",
            platform="Cloud Run / Google AI Studio",
            battery=100,
            network="Cloud Backbone (10 Gbps)",
            capabilities=["multimodal_reasoning", "continuous_monitoring", "self_improvement", "ecommerce_indexing"],
            lat=35.6762,
            lng=139.6503,
            location_label="Cloud Region Asia-Southeast"
        ))

    def register(self, dev: MeshDevice):
        self.devices[dev.device_id] = dev
        self._record_audit(f"Device registered into mesh: {dev.device_name}", dev.device_id, "INFO")

    def get_device(self, device_id: str) -> Optional[MeshDevice]:
        return self.devices.get(device_id)

    def list_devices(self) -> List[Dict[str, Any]]:
        return [d.to_dict() for d in self.devices.values()]

    def trigger_locator_siren(self, device_id: str) -> Dict[str, Any]:
        dev = self.get_device(device_id)
        if not dev:
            return {"success": False, "error": "Device not found"}
        dev.siren_active = True
        self._record_audit(f"Anti-Loss Acoustic Siren activated at 100% volume on {dev.device_name}", device_id, "ACTION")
        logger.device(f"Acoustic locator siren triggered on {dev.device_name}")
        return {
            "success": True,
            "siren_active": True,
            "device": dev.device_name,
            "location": {"lat": dev.lat, "lng": dev.lng, "label": dev.location_label},
            "message": f"Locator beacon blasting at maximum volume on {dev.device_name}."
        }

    def toggle_security_lock(self, device_id: str, lock_state: Optional[bool] = None) -> Dict[str, Any]:
        dev = self.get_device(device_id)
        if not dev:
            return {"success": False, "error": "Device not found"}
        dev.is_locked = not dev.is_locked if lock_state is None else lock_state
        self._record_audit(f"Device lock state changed to {'LOCKED' if dev.is_locked else 'UNLOCKED'}", device_id, "SECURITY")
        return {"success": True, "device": dev.device_name, "is_locked": dev.is_locked}

    def verify_auth_token(self, token: str, payload: str) -> bool:
        expected = hmac.new(MESH_SHARED_SECRET, payload.encode("utf-8"), hashlib.sha256).hexdigest()
        return hmac.compare_digest(expected, token)

    def _record_audit(self, event: str, device_id: str, level: str = "INFO"):
        self.audit_log.insert(0, {
            "timestamp": time.time(),
            "event": event,
            "device_id": device_id,
            "level": level
        })
        if len(self.audit_log) > 100:
            self.audit_log.pop()

global_device_registry = DeviceRegistry()
