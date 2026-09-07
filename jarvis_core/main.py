"""
MURSAL JARVIS Python Core Server & Orchestrator
Provides high-performance internal JSON API and CLI evaluation interface.
Handles command routing, execution locks, tool registry, memory OS, diagnostics, and self-improvement.
"""

import sys
import json
import time
import argparse
from typing import Dict, Any, List, Optional
from http.server import HTTPServer, BaseHTTPRequestHandler
from socketserver import ThreadingMixIn
from urllib.parse import urlparse, parse_qs

from .logger import logger
from .command_gateway import global_execution_guard, VoicePipelinePhase
from .intent_planner import global_intent_planner
from .tool_registry import global_tool_registry
from .device_registry import global_device_registry
from .memory_system import global_memory_system, MemoryType
from .automation_engine import global_automation_engine
from .self_diagnostics import global_diagnostics
from .recommendation_engine import global_recommendation_engine
from .self_improvement import global_self_improvement
from .version_control import global_version_manager

class ThreadedHTTPServer(ThreadingMixIn, HTTPServer):
    daemon_threads = True

class JarvisCoreHandler(BaseHTTPRequestHandler):
    def _send_json(self, data: Any, status: int = 200):
        try:
            body = json.dumps(data, ensure_ascii=False).encode("utf-8")
            self.send_response(status)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
            self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
            self.end_headers()
            self.wfile.write(body)
        except Exception as e:
            logger.error(f"Failed to send JSON response: {e}")

    def do_OPTIONS(self):
        self._send_json({"status": "ok"})

    def _read_json_body(self) -> Dict[str, Any]:
        content_len = int(self.headers.get("Content-Length", 0))
        if content_len == 0:
            return {}
        raw = self.rfile.read(content_len).decode("utf-8")
        try:
            return json.loads(raw)
        except Exception:
            return {}

    def do_GET(self):
        url = urlparse(self.path)
        path = url.path.rstrip("/")
        qs = parse_qs(url.query)

        # 1. /health
        if path == "/health" or path == "":
            self._send_json(global_diagnostics.get_health())

        # 2. /models
        elif path == "/models":
            self._send_json(global_diagnostics.get_models())

        # 3. /devices
        elif path == "/devices":
            self._send_json(global_diagnostics.get_devices())

        # 4. /diagnostics
        elif path == "/diagnostics":
            self._send_json(global_diagnostics.run_comprehensive_diagnostics())

        # 5. /tools
        elif path == "/tools":
            self._send_json({"tools": global_tool_registry.list_tools()})

        # 6. /memory
        elif path == "/memory":
            search = qs.get("search", [""])[0]
            self._send_json({"memories": global_memory_system.query(search_text=search)})

        # 7. /automation
        elif path == "/automation":
            self._send_json({
                "routines": global_automation_engine.list_routines(),
                "history": global_automation_engine.execution_history
            })

        # 8. /recommendations
        elif path == "/recommendations":
            self._send_json({"recommendations": global_recommendation_engine.list_recommendations()})

        # 9. /proposals
        elif path == "/proposals":
            self._send_json({"proposals": global_self_improvement.list_proposals()})

        # 10. /versions
        elif path == "/versions":
            self._send_json({
                "current_version": global_version_manager.current_version,
                "checkpoints": global_version_manager.list_checkpoints(),
                "changelog": global_version_manager.list_changelog()
            })

        # 11. /state
        elif path == "/state":
            self._send_json(global_execution_guard.get_state())

        else:
            self._send_json({"error": "Endpoint not found", "path": path}, status=404)

    def do_POST(self):
        url = urlparse(self.path)
        path = url.path.rstrip("/")
        body = self._read_json_body()

        # 1. /command: Main command dispatch with Global Execution Guard
        if path == "/command":
            text = body.get("text") or body.get("prompt") or ""
            if not text:
                self._send_json({"error": "Text prompt required"}, status=400)
                return

            cmd_id = body.get("command_id") or body.get("commandId")
            req_id = body.get("request_id") or body.get("requestId")

            # Check execution guard lock & deduplication
            acquired, exec_id, reject_reason, cached_result = global_execution_guard.acquire_execution(
                raw_text=text,
                command_id=cmd_id,
                request_id=req_id
            )

            if not acquired:
                # Return cached or deduplication acknowledgement
                self._send_json({
                    "success": False,
                    "deduplicated": True,
                    "reason": reject_reason,
                    "cached_result": cached_result,
                    "state": global_execution_guard.get_state()
                }, status=200)
                return

            # Execute pipeline: Intent Analysis -> Planning -> Tool Execution -> Memory -> Voice Response
            try:
                global_execution_guard.set_phase(VoicePipelinePhase.INTENT_ANALYSIS)
                intent_plan = global_intent_planner.parse_intent(text)
                
                tool_result = None
                if intent_plan.get("tool"):
                    global_execution_guard.set_phase(VoicePipelinePhase.TOOL_EXECUTION)
                    tool_result = global_tool_registry.execute(
                        name=intent_plan["tool"],
                        params=intent_plan.get("params", {}),
                        confirmed=body.get("confirmed", False)
                    )

                # Conversational Memory update
                global_memory_system.remember(
                    content=f"User: {text} | JARVIS: {intent_plan['reply']}",
                    memory_type=MemoryType.CONVERSATION_MEMORY
                )

                response_payload = {
                    "success": True,
                    "execution_id": exec_id,
                    "command_id": cmd_id,
                    "input_text": text,
                    "language": intent_plan.get("language", "ur-Roman"),
                    "intent": intent_plan.get("intent", "CONVERSATIONAL_INTELLIGENCE"),
                    "reply": intent_plan.get("reply", "Hukam karein jani, MURSAL JARVIS hazir hai."),
                    "tool_execution": tool_result,
                    "state": global_execution_guard.get_state()
                }

                # Release execution lock and cache result
                global_execution_guard.release_execution(exec_id, response_payload)
                self._send_json(response_payload)

            except Exception as e:
                logger.error(f"Command execution failure: {e}", exc=e)
                global_execution_guard.release_execution(exec_id, {"error": str(e)})
                self._send_json({"success": False, "error": str(e), "execution_id": exec_id}, status=500)

        # 2. /tools/execute
        elif path == "/tools/execute":
            name = body.get("name")
            params = body.get("params", {})
            confirmed = body.get("confirmed", False)
            if not name:
                self._send_json({"error": "Tool name required"}, status=400)
                return
            res = global_tool_registry.execute(name, params, confirmed)
            self._send_json(res)

        # 3. /memory/remember
        elif path == "/memory/remember":
            content = body.get("content", "")
            mtype_str = body.get("type", "USER_PREFERENCES")
            try:
                mtype = MemoryType[mtype_str]
            except KeyError:
                mtype = MemoryType.USER_PREFERENCES
            res = global_memory_system.remember(content, mtype)
            self._send_json(res)

        # 4. /memory/forget
        elif path == "/memory/forget":
            query = body.get("query") or body.get("id") or ""
            res = global_memory_system.forget(query)
            self._send_json(res)

        # 5. /automation/trigger
        elif path == "/automation/trigger":
            routine_id = body.get("routine_id")
            res = global_automation_engine.execute_routine(routine_id)
            self._send_json(res)

        # 6. /proposals/apply
        elif path == "/proposals/apply":
            proposal_id = body.get("proposal_id")
            res = global_self_improvement.execute_controlled_pipeline(proposal_id)
            self._send_json(res)

        # 7. /version/rollback
        elif path == "/version/rollback":
            snapshot_id = body.get("snapshot_id")
            res = global_version_manager.rollback_to_checkpoint(snapshot_id)
            self._send_json(res)

        # 8. /reset
        elif path == "/reset":
            global_execution_guard.reset_to_standby()
            self._send_json({"success": True, "state": global_execution_guard.get_state()})

        else:
            self._send_json({"error": "Endpoint not found", "path": path}, status=404)

def run_server(port: int = 5050):
    server = ThreadedHTTPServer(("127.0.0.1", port), JarvisCoreHandler)
    logger.update(f"MURSAL JARVIS Python Core Server listening on http://127.0.0.1:{port}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        logger.voice("Shutting down Python Core Server.")
        server.server_close()

def main():
    parser = argparse.ArgumentParser(description="MURSAL JARVIS Python Core Orchestrator")
    parser.add_argument("--port", type=int, default=5050, help="Internal port to listen on")
    parser.add_argument("--eval", type=str, help="Evaluate a single command JSON payload")
    args = parser.parse_args()

    if args.eval:
        try:
            data = json.loads(args.eval)
            text = data.get("text", "")
            acquired, exec_id, reason, cached = global_execution_guard.acquire_execution(text)
            if not acquired:
                print(json.dumps({"success": False, "deduplicated": True, "reason": reason}))
                sys.exit(0)
            intent = global_intent_planner.parse_intent(text)
            tool_res = None
            if intent.get("tool"):
                tool_res = global_tool_registry.execute(intent["tool"], intent.get("params", {}), data.get("confirmed", False))
            payload = {
                "success": True,
                "execution_id": exec_id,
                "intent": intent,
                "tool_execution": tool_res
            }
            global_execution_guard.release_execution(exec_id, payload)
            print(json.dumps(payload, indent=2))
        except Exception as e:
            print(json.dumps({"error": str(e)}))
            sys.exit(1)
    else:
        run_server(args.port)

if __name__ == "__main__":
    main()
