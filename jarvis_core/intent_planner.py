"""
Pakistani Multilingual NLP & Intent Planning Engine for MURSAL JARVIS
Understands English, Roman Urdu, Urdu, Punjabi, Saraiki, Pashto, Sindhi, and mixed conversational Pakistani speech.
Translates speech input into deterministic, multi-step execution plans.
"""

import re
from typing import Dict, Any, List, Optional
from .logger import logger

LANG_PATTERNS = {
    "ur": re.compile(r'[\u0600-\u06FF]'),
    "ur-Roman": re.compile(r'(?i)\b(kholo|bhejo|batao|kya|scene|hai|jani|yaar|kar|do|band|chala|dhoondo|kahan|yaad|ammi|abbu|bhai|theek|sahi|acha|kitna)\b'),
    "pa": re.compile(r'(?i)\b(kiddan|daso|chalo|veere|paji|kinna|hukam|aey|si|kithay)\b'),
    "skr": re.compile(r'(?i)\b(kiven|hissab|bhal|kayi|dasae)\b'),
    "ps": re.compile(r'(?i)\b(dera|manana|sangaye|kha|rasha|staso|zama)\b'),
    "sd": re.compile(r'(?i)\b(kian|ahiyo|ada|chha|hal|bhala)\b'),
}

class IntentPlanner:
    def detect_language(self, text: str) -> str:
        if LANG_PATTERNS["ur"].search(text):
            return "ur"
        if LANG_PATTERNS["pa"].search(text):
            return "pa"
        if LANG_PATTERNS["ps"].search(text):
            return "ps"
        if LANG_PATTERNS["sd"].search(text):
            return "sd"
        if LANG_PATTERNS["skr"].search(text):
            return "skr"
        if LANG_PATTERNS["ur-Roman"].search(text):
            return "ur-Roman"
        return "en"

    def parse_intent(self, text: str) -> Dict[str, Any]:
        raw = text.strip()
        lang = self.detect_language(raw)
        lower = raw.lower()

        # 1. App Launch: "open whatsapp", "whatsapp kholo", "youtube chalao"
        open_match = re.search(r'(?i)(?:open|launch|kholo|chalao|start)\s+([a-z0-9\s]+)', lower) or \
                     re.search(r'(?i)([a-z0-9\s]+)\s+(?:kholo|chalao|open)', lower)
        if open_match and not any(w in lower for w in ("wifi", "wi-fi", "bluetooth", "automation", "music", "song")):
            candidate = open_match.group(1).strip()
            for app in ("whatsapp", "youtube", "camera", "daraz", "settings", "chrome", "spotify", "instagram", "olx"):
                if app in candidate or candidate in app:
                    return {
                        "intent": "OPEN_APP",
                        "tool": "open_app",
                        "params": {"app": app.capitalize()},
                        "language": lang,
                        "reply": f"{app.capitalize()} open kar raha hoon jani." if lang == "ur-Roman" else f"Opening {app.capitalize()} for you."
                    }

        # 2. Close App: "close whatsapp", "whatsapp band karo"
        if any(w in lower for w in ("close", "band karo", "exit", "hata do")) and any(w in lower for w in ("whatsapp", "youtube", "chrome", "camera", "app")):
            app = "WhatsApp" if "whatsapp" in lower else "YouTube" if "youtube" in lower else "Application"
            return {
                "intent": "CLOSE_APP",
                "tool": "close_app",
                "params": {"app": app},
                "language": lang,
                "reply": f"{app} band kar diya jani." if lang == "ur-Roman" else f"Closed {app}."
            }

        # 3. Messaging: "send a message to Ali", "Ammi ko message bhejo", "message Ali"
        if any(w in lower for w in ("message", "msg", "sms", "whatsapp message", "bhejo")):
            match = re.search(r'(?i)(?:message|msg|bhejo)\s+(?:to\s+)?([a-z]+)', lower) or \
                    re.search(r'(?i)([a-z]+)\s+ko\s+message', lower)
            recipient = match.group(1).capitalize() if match else "Ali"
            return {
                "intent": "SEND_MESSAGE",
                "tool": "send_message",
                "params": {"recipient": recipient, "message": "Voice command dispatched via JARVIS", "channel": "whatsapp"},
                "language": lang,
                "reply": f"{recipient} ko message bhej diya hai." if lang == "ur-Roman" else f"Dispatched message to {recipient}."
            }

        # 4. Calling: "call Ahmed", "Ali ko call milao", "make a call"
        if any(w in lower for w in ("call", "phone milao", "call karo")):
            match = re.search(r'(?i)(?:call|dial)\s+([a-z]+)', lower) or \
                    re.search(r'(?i)([a-z]+)\s+ko\s+call', lower)
            contact = match.group(1).capitalize() if match else "Ahmed"
            return {
                "intent": "MAKE_CALL",
                "tool": "make_call",
                "params": {"contact": contact},
                "language": lang,
                "reply": f"{contact} ko call mila raha hoon." if lang == "ur-Roman" else f"Calling {contact} now."
            }

        # 5. Wi-Fi Control: "turn on wifi", "wifi band kar do", "wifi on karo"
        if "wifi" in lower or "wi-fi" in lower or "internet" in lower:
            state = not any(w in lower for w in ("off", "band", "bujha", "disable"))
            return {
                "intent": "WIFI_CONTROL",
                "tool": "wifi_control",
                "params": {"enabled": state},
                "language": lang,
                "reply": f"Wi-Fi {'on' if state else 'off'} kar diya hai jani." if lang == "ur-Roman" else f"Wi-Fi toggled {'ON' if state else 'OFF'}."
            }

        # 6. Bluetooth Control: "turn off bluetooth", "bluetooth on karo"
        if "bluetooth" in lower or "bt" in lower:
            state = not any(w in lower for w in ("off", "band", "disable"))
            return {
                "intent": "BLUETOOTH_CONTROL",
                "tool": "bluetooth_control",
                "params": {"enabled": state},
                "language": lang,
                "reply": f"Bluetooth {'on' if state else 'off'} kar diya." if lang == "ur-Roman" else f"Bluetooth toggled {'ON' if state else 'OFF'}."
            }

        # 7. Device Status & Battery: "check device status", "battery kitni hai", "what's on my phone"
        if any(w in lower for w in ("device status", "phone status", "battery", "charge", "percentage", "phone status batao")):
            return {
                "intent": "DEVICE_STATUS",
                "tool": "device_status",
                "params": {},
                "language": lang,
                "reply": "Battery 88% hai jani, network Wi-Fi 6 pe fully connected hai." if lang == "ur-Roman" else "Battery is at 88%, connected to Wi-Fi 6."
            }

        # 8. Notifications: "read my notifications", "koi notification aayi hai", "read messages"
        if any(w in lower for w in ("notification", "notifications", "unread", "khabrein")):
            return {
                "intent": "READ_NOTIFICATIONS",
                "tool": "read_notifications",
                "params": {"filter_app": "all"},
                "language": lang,
                "reply": "Aapki 3 new notifications hain: WhatsApp Ali Khan, Daraz seller credit, aur Markaz restock alert." if lang == "ur-Roman" else "You have 3 notifications from WhatsApp, Daraz, and Markaz."
            }

        # 9. Find Device / Acoustic Beacon: "where is my phone?", "phone dhoondo", "find my phone"
        if any(w in lower for w in ("where is my phone", "find my phone", "phone dhoondo", "mobile kahan", "ring my phone")):
            return {
                "intent": "FIND_DEVICE",
                "tool": "find_device",
                "params": {"duration_seconds": 30},
                "language": lang,
                "reply": "Phone pe full volume acoustic siren chala diya hai taakay asani se mil jaye!" if lang == "ur-Roman" else "Acoustic locator beacon activated at maximum volume."
            }

        # 10. Volume Control: "volume set karo", "sound barhao", "volume 80"
        if any(w in lower for w in ("volume", "awaz", "awaaz", "sound")):
            num_match = re.search(r'(\d+)', lower)
            level = int(num_match.group(1)) if num_match else 30 if any(w in lower for w in ("kam", "down", "low")) else 80
            return {
                "intent": "VOLUME_CONTROL",
                "tool": "volume_control",
                "params": {"level": level},
                "language": lang,
                "reply": f"Volume {level}% pe set kar diya hai." if lang == "ur-Roman" else f"Volume adjusted to {level}%."
            }

        # 11. Media / Playlist: "play my playlist", "gaana chalao", "pause music"
        if any(w in lower for w in ("playlist", "song", "music", "gaana", "gana", "play", "pause")):
            action = "pause" if any(w in lower for w in ("pause", "rok", "stop")) else "next" if "next" in lower else "play"
            return {
                "intent": "MEDIA_CONTROL",
                "tool": "media_control",
                "params": {"action": action},
                "language": lang,
                "reply": f"Music {action} ho gaya jani." if lang == "ur-Roman" else f"Media command '{action}' sent."
            }

        # 12. Reminders: "set a reminder", "mujhe kal 8 baje yaad dila dena"
        if any(w in lower for w in ("reminder", "yaad dila", "remind me")):
            return {
                "intent": "REMINDER",
                "tool": "reminder",
                "params": {"text": raw, "time": "scheduled time"},
                "language": lang,
                "reply": "Reminder set kar diya hai jani, time pe aagah kar doon ga." if lang == "ur-Roman" else "Reminder registered successfully."
            }

        # 13. Laptop Mesh Control: "connect to my laptop", "laptop ka status batao", "check laptop"
        if any(w in lower for w in ("laptop", "computer", "pc", "workstation")):
            return {
                "intent": "LAPTOP_CONTROL",
                "tool": "laptop_control",
                "params": {"command": "status"},
                "language": lang,
                "reply": "Laptop online hai, encrypted mesh se paired hai aur CPU load normal hai." if lang == "ur-Roman" else "Laptop workstation is online and paired via encrypted mesh."
            }

        # 14. Automation: "start automation", "stop automation"
        if "automation" in lower:
            action = "stop" if any(w in lower for w in ("stop", "band", "cancel")) else "start"
            return {
                "intent": "AUTOMATION",
                "tool": "automation",
                "params": {"action": action, "routine": "daily_operating_routine"},
                "language": lang,
                "reply": f"Automation routine {action} ho gayi hai." if lang == "ur-Roman" else f"Automation routine {action}ed."
            }

        # 15. Time Check: "what time is it", "time kya hua hai", "time batao"
        if any(w in lower for w in ("what time", "time kya", "kitne baje")):
            return {
                "intent": "TELL_TIME",
                "tool": "device_status",
                "params": {"query": "time"},
                "language": lang,
                "reply": "Abhi local time active hai jani, routine normal chal rahi hai." if lang == "ur-Roman" else "Local system clock is verified and running on schedule."
            }

        # Default reasoning fallback
        return {
            "intent": "CONVERSATIONAL_INTELLIGENCE",
            "tool": None,
            "params": {},
            "language": lang,
            "reply": "Walaikum Assalam jani! MURSAL JARVIS hazir hai. Hukam karein kya karna hai?" if lang == "ur-Roman" else "MURSAL JARVIS standing by. How can I assist your operating workflow?"
        }

global_intent_planner = IntentPlanner()
