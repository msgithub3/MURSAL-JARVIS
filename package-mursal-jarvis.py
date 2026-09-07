#!/usr/bin/env python3
"""
MURSAL JARVIS — Release Packaging Engine
Builds MURSAL_JARVIS_COMPLETE.zip containing:
- Full Android Kotlin Native Source Tree (/android)
- Full-Stack Cloud & Backend Core (server.ts, package.json, tsconfig.json, vite.config.ts)
- Futuristic React UI Cockpit & HUD (/src)
- CI/CD Workflows (/.github)
- Complete Ecosystem Research & Architecture Documentation
- Automated Test Suites (/scripts)
Excludes: node_modules, dist, .git, secret .env files.
"""

import os
import zipfile
import sys

OUTPUT_ZIP = "MURSAL_JARVIS_COMPLETE.zip"

EXCLUDE_DIRS = {
    "node_modules",
    ".git",
    "dist",
    ".cache",
    ".gradle",
    "build",
}

EXCLUDE_FILES = {
    ".env",
    OUTPUT_ZIP
}

def should_exclude(rel_path):
    parts = rel_path.split(os.sep)
    for part in parts:
        if part in EXCLUDE_DIRS:
            return True
    filename = os.path.basename(rel_path)
    if filename in EXCLUDE_FILES or filename.endswith(".pyc") or filename.endswith(".tmp"):
        return True
    return False

def build_package():
    print(f"--> Packaging MURSAL JARVIS into {OUTPUT_ZIP}...")
    file_count = 0
    with zipfile.ZipFile(OUTPUT_ZIP, "w", zipfile.ZIP_DEFLATED) as zipf:
        for root, dirs, files in os.walk("."):
            # Filter dirs in-place
            dirs[:] = [d for d in dirs if d not in EXCLUDE_DIRS and not d.startswith(".git")]
            for file in files:
                full_path = os.path.join(root, file)
                rel_path = os.path.relpath(full_path, ".")
                if should_exclude(rel_path):
                    continue
                zipf.write(full_path, rel_path)
                file_count += 1

    size_mb = os.path.getsize(OUTPUT_ZIP) / (1024 * 1024)
    print(f"[\033[92mSUCCESS\033[0m] Bundled {file_count} verified files into {OUTPUT_ZIP} ({size_mb:.2f} MB)")

if __name__ == "__main__":
    build_package()
