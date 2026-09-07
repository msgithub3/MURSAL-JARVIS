"""
Modular Tool System & Safety Matrix for MURSAL JARVIS
Defines 20 modular tools with formal risk levels, parameters, result schemas, and handlers.
"""

from typing import Dict, Any, Callable, List, Optional
from enum import Enum
import time
from .logger import logger

class RiskLevel(str, Enum):
    LOW_RISK = "LOW_RISK"
    MEDIUM_RISK = "MEDIUM_RISK"
    HIGH_RISK = "HIGH_RISK"

class ToolDefinition:
    def __init__(
        self,
        name: str,
        description: str,
        parameters: Dict[str, Any],
        permissions: List[str],
        risk_level: RiskLevel,
        handler: Callable[[Dict[str, Any], bool], Dict[str, Any]],
        result_schema: Dict[str, Any]
    ):
        self.name = name
        self.description = description
        self.parameters = parameters
        self.permissions = permissions
        self.risk_level = risk_level
        self.handler = handler
        self.result_schema = result_schema

    def to_dict(self) -> Dict[str, Any]:
        return {
            "name": self.name,
            "description": self.description,
            "parameters": self.parameters,
            "permissions": self.permissions,
            "risk_level": self.risk_level.value,
            "result_schema": self.result_schema
        }

class ToolRegistry:
    def __init__(self):
        self.tools: Dict[str, ToolDefinition] = {}
        self._register_default_tools()

    def register(self, tool: ToolDefinition) -> None:
        self.tools[tool.name] = tool
        logger.tool(f"Registered tool: {tool.name} [{tool.risk_level.value}]")

    def get_tool(self, name: str) -> Optional[ToolDefinition]:
        return self.tools.get(name)

    def list_tools(self) -> List[Dict[str, Any]]:
        return [t.to_dict() for t in self.tools.values()]

    def execute(self, name: str, params: Dict[str, Any], confirmed: bool = False) -> Dict[str, Any]:
        tool = self.get_tool(name)
        if not tool:
            logger.error(f"Tool not found: {name}")
            return {"success": False, "error": f"Tool '{name}' not found", "action": name}

        if tool.risk_level == RiskLevel.HIGH_RISK and not confirmed:
            logger.tool(f"HIGH_RISK action '{name}' halted: requires user confirmation")
            return {
                "success": False,
                "requires_confirmation": True,
                "risk_level": tool.risk_level.value,
                "message": f"Action '{name}' is classified as HIGH RISK and requires explicit voice confirmation.",
                "action": name,
                "parameters": params
            }

        logger.tool(f"Executing '{name}' with params={params} (confirmed={confirmed})")
        start = time.time()
        try:
            result = tool.handler(params, confirmed)
            duration = time.time() - start
            result["execution_duration_ms"] = round(duration * 1000, 2)
            result["action"] = name
            return result
        except Exception as e:
            logger.error(f"Error executing tool '{name}': {e}", exc=e)
            return {
                "success": False,
                "error": str(e),
                "action": name,
                "execution_duration_ms": round((time.time() - start) * 1000, 2)
            }

    def _register_default_tools(self):
        # 1. open_app
        self.register(ToolDefinition(
            name="open_app",
            description="Launch an authorized application on user's Android phone or laptop.",
            parameters={"app": {"type": "string", "required": True}},
            permissions=["android.permission.INTERNET"],
            risk_level=RiskLevel.LOW_RISK,
            handler=lambda p, c: {"success": True, "app": p.get("app", "Application"), "state": "LAUNCHED", "message": f"Opened {p.get('app')}"},
            result_schema={"success": "boolean", "app": "string", "state": "string"}
        ))

        # 2. close_app
        self.register(ToolDefinition(
            name="close_app",
            description="Close or minimize background application.",
            parameters={"app": {"type": "string", "required": True}},
            permissions=["android.permission.INTERNET"],
            risk_level=RiskLevel.LOW_RISK,
            handler=lambda p, c: {"success": True, "app": p.get("app", "Application"), "state": "CLOSED", "message": f"Closed {p.get('app')}"},
            result_schema={"success": "boolean", "app": "string"}
        ))

        # 3. send_message
        self.register(ToolDefinition(
            name="send_message",
            description="Send a message to a contact via WhatsApp or SMS.",
            parameters={
                "recipient": {"type": "string", "required": True},
                "message": {"type": "string", "required": True},
                "channel": {"type": "string", "default": "whatsapp"}
            },
            permissions=["android.permission.SEND_SMS"],
            risk_level=RiskLevel.MEDIUM_RISK,
            handler=lambda p, c: {
                "success": True,
                "recipient": p.get("recipient"),
                "channel": p.get("channel", "whatsapp"),
                "message_preview": (p.get("message") or "")[:40],
                "status": "DISPATCHED"
            },
            result_schema={"success": "boolean", "recipient": "string", "status": "string"}
        ))

        # 4. make_call
        self.register(ToolDefinition(
            name="make_call",
            description="Initiate voice call to a designated contact.",
            parameters={"contact": {"type": "string", "required": True}},
            permissions=["android.permission.CALL_PHONE"],
            risk_level=RiskLevel.MEDIUM_RISK,
            handler=lambda p, c: {"success": True, "contact": p.get("contact"), "status": "DIALING", "message": f"Calling {p.get('contact')}"},
            result_schema={"success": "boolean", "contact": "string", "status": "string"}
        ))

        # 5. read_notifications
        self.register(ToolDefinition(
            name="read_notifications",
            description="Read and summarize incoming device notifications.",
            parameters={"filter_app": {"type": "string", "default": "all"}},
            permissions=["android.permission.BIND_NOTIFICATION_LISTENER_SERVICE"],
            risk_level=RiskLevel.LOW_RISK,
            handler=lambda p, c: {
                "success": True,
                "count": 3,
                "notifications": [
                    {"app": "WhatsApp", "sender": "Ali Khan", "text": "Bhai product delivery ka status kya hai?"},
                    {"app": "Daraz", "sender": "Daraz PK", "text": "Your seller balance of Rs. 14,200 has been credited."},
                    {"app": "Markaz", "sender": "Markaz App", "text": "New wholesale stock arrived in Shah Alam hub."}
                ]
            },
            result_schema={"success": "boolean", "count": "number", "notifications": "array"}
        ))

        # 6. device_status
        self.register(ToolDefinition(
            name="device_status",
            description="Retrieve real-time battery, network, memory and thermal telemetry.",
            parameters={},
            permissions=[],
            risk_level=RiskLevel.LOW_RISK,
            handler=lambda p, c: {
                "success": True,
                "battery": 88,
                "charging": False,
                "network": "Wi-Fi 6 (5GHz)",
                "storage_free_gb": 42.5,
                "ram_usage_pct": 64,
                "device": "Mursal Android Pro"
            },
            result_schema={"success": "boolean", "battery": "number", "network": "string"}
        ))

        # 7. wifi_control
        self.register(ToolDefinition(
            name="wifi_control",
            description="Turn Wi-Fi radio on or off where Android permissions permit.",
            parameters={"enabled": {"type": "boolean", "required": True}},
            permissions=["android.permission.CHANGE_WIFI_STATE"],
            risk_level=RiskLevel.MEDIUM_RISK,
            handler=lambda p, c: {
                "success": True,
                "state": "ENABLED" if p.get("enabled", True) else "DISABLED",
                "message": f"Wi-Fi set to {'ENABLED' if p.get('enabled', True) else 'DISABLED'}"
            },
            result_schema={"success": "boolean", "state": "string"}
        ))

        # 8. bluetooth_control
        self.register(ToolDefinition(
            name="bluetooth_control",
            description="Toggle device Bluetooth state.",
            parameters={"enabled": {"type": "boolean", "required": True}},
            permissions=["android.permission.BLUETOOTH_CONNECT"],
            risk_level=RiskLevel.MEDIUM_RISK,
            handler=lambda p, c: {
                "success": True,
                "state": "ENABLED" if p.get("enabled", True) else "DISABLED",
                "message": f"Bluetooth set to {'ENABLED' if p.get('enabled', True) else 'DISABLED'}"
            },
            result_schema={"success": "boolean", "state": "string"}
        ))

        # 9. volume_control
        self.register(ToolDefinition(
            name="volume_control",
            description="Adjust media or alarm volume level (0-100%).",
            parameters={"level": {"type": "integer", "required": True}},
            permissions=[],
            risk_level=RiskLevel.LOW_RISK,
            handler=lambda p, c: {
                "success": True,
                "level": max(0, min(100, int(p.get("level", 70)))),
                "message": f"Volume adjusted to {max(0, min(100, int(p.get('level', 70))))}%"
            },
            result_schema={"success": "boolean", "level": "number"}
        ))

        # 10. media_control
        self.register(ToolDefinition(
            name="media_control",
            description="Playback transport controls (play, pause, next, prev).",
            parameters={"action": {"type": "string", "enum": ["play", "pause", "next", "prev"], "required": True}},
            permissions=[],
            risk_level=RiskLevel.LOW_RISK,
            handler=lambda p, c: {
                "success": True,
                "transport_action": p.get("action", "play"),
                "message": f"Media command '{p.get('action')}' dispatched"
            },
            result_schema={"success": "boolean", "transport_action": "string"}
        ))

        # 11. camera
        self.register(ToolDefinition(
            name="camera",
            description="Launch camera or capture viewport snapshot with explicit user intent.",
            parameters={"mode": {"type": "string", "default": "photo"}},
            permissions=["android.permission.CAMERA"],
            risk_level=RiskLevel.LOW_RISK,
            handler=lambda p, c: {"success": True, "mode": p.get("mode", "photo"), "message": "Camera viewfinder ready"},
            result_schema={"success": "boolean", "mode": "string"}
        ))

        # 12. location
        self.register(ToolDefinition(
            name="location",
            description="Get current geographic location for authorized device.",
            parameters={},
            permissions=["android.permission.ACCESS_FINE_LOCATION"],
            risk_level=RiskLevel.LOW_RISK,
            handler=lambda p, c: {
                "success": True,
                "latitude": 31.5204,
                "longitude": 74.3587,
                "city": "Lahore",
                "country": "Pakistan",
                "accuracy_meters": 12
            },
            result_schema={"success": "boolean", "latitude": "number", "longitude": "number", "city": "string"}
        ))

        # 13. find_device
        self.register(ToolDefinition(
            name="find_device",
            description="Acoustic beacon siren at maximum volume for anti-loss recovery.",
            parameters={"duration_seconds": {"type": "integer", "default": 30}},
            permissions=[],
            risk_level=RiskLevel.LOW_RISK,
            handler=lambda p, c: {
                "success": True,
                "beacon": "ACTIVE",
                "volume": 100,
                "duration_seconds": p.get("duration_seconds", 30),
                "message": "Anti-loss acoustic beacon playing at 100% volume"
            },
            result_schema={"success": "boolean", "beacon": "string", "volume": "number"}
        ))

        # 14. lock_device
        self.register(ToolDefinition(
            name="lock_device",
            description="Security lock screen for unauthorized access prevention.",
            parameters={"reason": {"type": "string", "default": "user_command"}},
            permissions=["android.permission.DEVICE_ADMIN"],
            risk_level=RiskLevel.HIGH_RISK,
            handler=lambda p, c: {
                "success": True,
                "locked": True,
                "reason": p.get("reason", "user_command"),
                "message": "Device screen locked securely"
            },
            result_schema={"success": "boolean", "locked": "boolean"}
        ))

        # 15. reminder
        self.register(ToolDefinition(
            name="reminder",
            description="Schedule a persistent voice or push notification reminder.",
            parameters={
                "text": {"type": "string", "required": True},
                "time": {"type": "string", "default": "in 1 hour"}
            },
            permissions=[],
            risk_level=RiskLevel.LOW_RISK,
            handler=lambda p, c: {
                "success": True,
                "reminder": p.get("text"),
                "due": p.get("time", "in 1 hour"),
                "message": f"Reminder set: '{p.get('text')}' for {p.get('time')}"
            },
            result_schema={"success": "boolean", "reminder": "string", "due": "string"}
        ))

        # 16. calendar
        self.register(ToolDefinition(
            name="calendar",
            description="Check schedule or create calendar entry.",
            parameters={"query": {"type": "string", "default": "today"}},
            permissions=[],
            risk_level=RiskLevel.LOW_RISK,
            handler=lambda p, c: {
                "success": True,
                "events": [
                    {"title": "MURSALCART Sourcing Call (Shah Alam Wholesale)", "time": "2:00 PM"},
                    {"title": "WhatsApp Customer Deliveries Review", "time": "5:30 PM"}
                ]
            },
            result_schema={"success": "boolean", "events": "array"}
        ))

        # 17. web_search
        self.register(ToolDefinition(
            name="web_search",
            description="Search the web for real-time information, market prices, or news.",
            parameters={"query": {"type": "string", "required": True}},
            permissions=["android.permission.INTERNET"],
            risk_level=RiskLevel.LOW_RISK,
            handler=lambda p, c: {
                "success": True,
                "query": p.get("query"),
                "summary": f"Web results synthesized for '{p.get('query')}': Active market availability and competitive benchmarks confirmed."
            },
            result_schema={"success": "boolean", "summary": "string"}
        ))

        # 18. file_search
        self.register(ToolDefinition(
            name="file_search",
            description="Search local documents and downloads for keywords.",
            parameters={"pattern": {"type": "string", "required": True}},
            permissions=["android.permission.READ_EXTERNAL_STORAGE"],
            risk_level=RiskLevel.LOW_RISK,
            handler=lambda p, c: {
                "success": True,
                "pattern": p.get("pattern"),
                "matches": [
                    {"name": "mursalcart_wholesale_catalog_2026.pdf", "size_kb": 1420},
                    {"name": "lahore_supplier_directory.xlsx", "size_kb": 280}
                ]
            },
            result_schema={"success": "boolean", "matches": "array"}
        ))

        # 19. automation
        self.register(ToolDefinition(
            name="automation",
            description="Trigger, start, or stop automation workflow routines.",
            parameters={
                "routine": {"type": "string", "required": True},
                "action": {"type": "string", "enum": ["start", "stop", "status"], "default": "start"}
            },
            permissions=[],
            risk_level=RiskLevel.MEDIUM_RISK,
            handler=lambda p, c: {
                "success": True,
                "routine": p.get("routine"),
                "status": f"ROUTINE_{p.get('action', 'start').upper()}",
                "message": f"Automation routine '{p.get('routine')}' {p.get('action', 'start')}ed"
            },
            result_schema={"success": "boolean", "routine": "string", "status": "string"}
        ))

        # 20. laptop_control
        self.register(ToolDefinition(
            name="laptop_control",
            description="Control paired laptop over secure mesh network (telemetry, lock, open app).",
            parameters={
                "command": {"type": "string", "required": True},
                "subcommand": {"type": "string", "default": "status"}
            },
            permissions=[],
            risk_level=RiskLevel.MEDIUM_RISK,
            handler=lambda p, c: {
                "success": True,
                "node": "Mursal Workstation Laptop",
                "command": p.get("command"),
                "status": "EXECUTED_OVER_ENCRYPTED_MESH",
                "message": f"Laptop command '{p.get('command')}' executed successfully"
            },
            result_schema={"success": "boolean", "node": "string", "status": "string"}
        ))

global_tool_registry = ToolRegistry()
