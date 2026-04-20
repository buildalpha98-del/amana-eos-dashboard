#!/usr/bin/env python3
"""
Audit useMutation() calls missing onError handlers.

Scope: src/hooks, src/components, src/app excluding test paths and
src/app/parent (parent portal — different UX pattern, separate scope).

Exits 0 if zero missing, 1 otherwise. Prints missing site locations.
"""
import re
import pathlib
import sys

SCAN_ROOTS = [pathlib.Path("src/hooks"), pathlib.Path("src/components"), pathlib.Path("src/app")]
# Exclude test files and parent-portal paths.
# Note: actual dirs are src/app/parent/ (no parens — not a Next.js route group).
# No cowork portal dir exists today.
EXCLUDE_PATH_PARTS = ("__tests__", "/parent/")

missing = []
total = 0

for root in SCAN_ROOTS:
    if not root.exists():
        continue
    for f in sorted(list(root.rglob("*.ts")) + list(root.rglob("*.tsx"))):
        if any(p in str(f) for p in EXCLUDE_PATH_PARTS) or ".test." in str(f):
            continue
        src = f.read_text()
        for m in re.finditer(r"useMutation\s*(<[^>]*>)?\s*\(\s*\{", src):
            start = m.start()
            i = src.index("{", start)
            depth = 0
            end = i
            for j in range(i, len(src)):
                if src[j] == "{":
                    depth += 1
                elif src[j] == "}":
                    depth -= 1
                    if depth == 0:
                        end = j
                        break
            block = src[start:end + 1]
            total += 1
            if "onError" not in block:
                lineno = src[:start].count("\n") + 1
                missing.append((str(f), lineno))

print(f"Total useMutation(object) calls scanned: {total}")
print(f"Missing onError: {len(missing)}")
for f, ln in missing:
    print(f"  {f}:{ln}")

sys.exit(1 if missing else 0)
