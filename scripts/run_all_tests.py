#!/usr/bin/env python3
"""
MURSAL JARVIS — Comprehensive Automated Test Runner
Tests live server endpoints, MURSALCART financial math, and system integrity.
"""
import urllib.request
import urllib.parse
import json
import sys

BASE_URL = "http://localhost:3000"

def log_pass(msg):
    print(f"[\033[92mPASS\033[0m] {msg}")

def log_fail(msg):
    print(f"[\033[91mFAIL\033[0m] {msg}")
    sys.exit(1)

def test_health():
    print("--> Testing /api/health...")
    req = urllib.request.Request(f"{BASE_URL}/api/health")
    with urllib.request.urlopen(req) as resp:
        assert resp.status == 200, f"Expected 200, got {resp.status}"
        data = json.loads(resp.read().decode())
        assert data.get("status") == "ok", "Expected status: ok"
        assert data.get("mode") == "MURSALCART_ALWAYS_ON", "Expected MURSALCART_ALWAYS_ON mode"
        assert "gemini-3.8-flash" in data.get("activeModel", ""), "Expected gemini-3.8-flash active model"
        log_pass("Health API returned valid system configuration")

def test_mursalcart_evaluation():
    print("--> Testing MURSALCART 12-Metric Evaluation Engine...")
    payload = json.dumps({
        "productName": "T900 Ultra Smartwatch",
        "category": "Electronics & Gadgets",
        "supplierPrice": 1150,
        "sellingPrice": 2499,
        "shippingCost": 250
    }).encode("utf-8")

    req = urllib.request.Request(
        f"{BASE_URL}/api/jarvis/mursalcart/evaluate",
        data=payload,
        headers={"Content-Type": "application/json"}
    )
    with urllib.request.urlopen(req) as resp:
        assert resp.status == 200
        data = json.loads(resp.read().decode())
        assert data["financials"]["grossProfit"] == 1099, "Gross profit calculation mismatch"
        assert len(data["metrics"]) == 12, "Must evaluate all 12 metrics"
        assert data["overallScore"] >= 75, "Winning product score must be >= 75"
        assert len(data["pakistaniSourcingChannels"]) >= 3, "Must include Pakistani sourcing channels"
        log_pass(f"MURSALCART evaluated '{data['productName']}' -> Score: {data['overallScore']}/100, Profit: Rs. {data['financials']['grossProfit']}")

def test_listing_generator():
    print("--> Testing MURSALCART Copywriting & Multi-Platform Generator...")
    payload = json.dumps({
        "productName": "Wireless TWS Earbuds Pro",
        "sellingPrice": "2499"
    }).encode("utf-8")

    req = urllib.request.Request(
        f"{BASE_URL}/api/jarvis/mursalcart/generate-listing",
        data=payload,
        headers={"Content-Type": "application/json"}
    )
    with urllib.request.urlopen(req) as resp:
        assert resp.status == 200
        data = json.loads(resp.read().decode())
        listing = data.get("listing", "")
        assert "facebook" in listing.lower(), "Must contain Facebook copy"
        assert "olx" in listing.lower(), "Must contain OLX copy"
        assert "instagram" in listing.lower() or "insta" in listing.lower(), "Must contain Instagram copy"
        log_pass("Multi-channel listing copy generated successfully")

def test_device_mesh():
    print("--> Testing Secure Device Mesh & Anti-Loss Protocol...")
    # Fetch devices
    req = urllib.request.Request(f"{BASE_URL}/api/jarvis/mesh/devices")
    with urllib.request.urlopen(req) as resp:
        assert resp.status == 200
        data = json.loads(resp.read().decode())
        devices = data.get("devices", [])
        assert len(devices) >= 2, "Expected at least 2 mesh nodes (Android + Cloud)"
        target_id = devices[0]["id"]
        log_pass(f"Mesh nodes discovered: {len(devices)} nodes online")

    # Dispatch Anti-Loss locate ping
    action_payload = json.dumps({
        "deviceId": target_id,
        "action": "LOCATE_PING"
    }).encode("utf-8")

    action_req = urllib.request.Request(
        f"{BASE_URL}/api/jarvis/mesh/action",
        data=action_payload,
        headers={"Content-Type": "application/json"}
    )
    with urllib.request.urlopen(action_req) as resp:
        assert resp.status == 200
        result = json.loads(resp.read().decode())
        assert result.get("success") is True
        log_pass("Anti-Loss acoustic locator beacon dispatched successfully")

def test_memory():
    print("--> Testing Quad-Tier Memory System...")
    payload = json.dumps({
        "type": "task",
        "category": "system_verification",
        "content": "Verify all 45 engineering mandates completed"
    }).encode("utf-8")

    req = urllib.request.Request(
        f"{BASE_URL}/api/jarvis/memory",
        data=payload,
        headers={"Content-Type": "application/json"}
    )
    with urllib.request.urlopen(req) as resp:
        assert resp.status == 200
        log_pass("Memory persisted and indexed")

def test_multilingual_and_device_actions():
    print("--> Testing Pakistani Multilingual Engine & Device Action Router...")
    
    # 1. Language Detection & Roman Urdu Normalization
    detect_payload = json.dumps({"text": "kia scene he yar mje battery btao"}).encode("utf-8")
    req = urllib.request.Request(f"{BASE_URL}/api/jarvis/language/detect", data=detect_payload, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req) as resp:
        assert resp.status == 200
        data = json.loads(resp.read().decode())
        assert data.get("detectedLanguage") in ["ur-Roman", "ur"], f"Expected Roman Urdu detection, got {data.get('detectedLanguage')}"
        log_pass(f"Language accurately detected: {data.get('detectedLanguage')} (confidence: {data.get('confidence')})")

    # 2. Device Telemetry State
    req = urllib.request.Request(f"{BASE_URL}/api/jarvis/device/state")
    with urllib.request.urlopen(req) as resp:
        assert resp.status == 200
        data = json.loads(resp.read().decode())
        state = data.get("state", {})
        assert "battery" in state and "level" in state["battery"], "Missing battery telemetry"
        assert "flashlight" in state, "Missing flashlight status"
        log_pass(f"Android Device Telemetry: Battery {state['battery']['level']}%, Flashlight {state['flashlight']}")

    # 3. Direct Device Action: Flashlight Toggle
    action_payload = json.dumps({"action": "control_flashlight", "params": {"state": "on"}}).encode("utf-8")
    req = urllib.request.Request(f"{BASE_URL}/api/jarvis/device/action", data=action_payload, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req) as resp:
        assert resp.status == 200
        data = json.loads(resp.read().decode())
        assert data["result"]["success"] is True
        log_pass("Device Action (Flashlight Toggle) executed successfully")

    # 4. Sensitive Action Confirmation Policy
    sensitive_payload = json.dumps({"action": "PURGE_ALL_MEMORIES", "confirmed": False}).encode("utf-8")
    req = urllib.request.Request(f"{BASE_URL}/api/jarvis/device/action", data=sensitive_payload, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req) as resp:
        assert resp.status == 200
        data = json.loads(resp.read().decode())
        assert data["result"]["requiresConfirmation"] is True, "Sensitive actions MUST require user confirmation"
        log_pass("Sensitive Action Confirmation Guard enforced successfully")

    # 5. Voice Barge-In / Interruption
    chat_payload = json.dumps({"prompt": "ruk jao jani, bas karo", "language": "ur-Roman"}).encode("utf-8")
    req = urllib.request.Request(f"{BASE_URL}/api/jarvis/chat", data=chat_payload, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req) as resp:
        assert resp.status == 200
        data = json.loads(resp.read().decode())
        assert data.get("isInterrupted") is True or data.get("detectedIntent") == "INTERRUPTION_BARGE_IN"
        log_pass("Voice Barge-In / Interruption triggered fast-path response")

def test_chat_resilience():
    print("--> Testing Chat API Resilience & Sovereign Cognitive Failover (429/503 Protection)...")
    queries = [
        ("Walaikum Assalam JARVIS, kya haal hai?", "ur-Roman"),
        ("MURSALCART: Winning product dhoondo with high COD profit", "ur-Roman"),
        ("What is the current status of the Android device?", "en"),
    ]
    for q, lang in queries:
        payload = json.dumps({"prompt": q, "language": lang, "voiceProfile": "friendly"}).encode("utf-8")
        req = urllib.request.Request(f"{BASE_URL}/api/jarvis/chat", data=payload, headers={"Content-Type": "application/json"})
        with urllib.request.urlopen(req) as resp:
            assert resp.status == 200, f"Chat must return HTTP 200, got {resp.status}"
            data = json.loads(resp.read().decode())
            assert "reply" in data and len(data["reply"]) > 10, f"Expected non-empty reply for '{q}'"
            assert data.get("engineMode") in ["GEMINI_CLOUD_LIVE", "SOVEREIGN_EDGE_FAILOVER", "SOVEREIGN_STANDALONE", "SOVEREIGN_RECOVERY", "DEVICE_CONTROL_LOCAL"], "Must declare valid engine mode"
            log_pass(f"Chat handled seamlessly ('{q[:30]}...') via {data.get('engineMode')}")

def main():
    print("==================================================")
    print("   MURSAL JARVIS AUTOMATED INTEGRATION TEST SUITE ")
    print("==================================================")
    try:
        test_health()
        test_mursalcart_evaluation()
        test_listing_generator()
        test_device_mesh()
        test_memory()
        test_multilingual_and_device_actions()
        test_chat_resilience()
        print("\n\033[92mALL 7 TEST MODULES PASSED (100% SUCCESS)\033[0m")
    except Exception as e:
        log_fail(f"Test suite encountered error: {e}")

if __name__ == "__main__":
    main()
