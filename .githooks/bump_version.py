#!/usr/bin/env python3
"""
Auto-bump VERSION (semver) every commit, then sync it to common manifests.

Default behavior: **roll patch every 13th commit** (0..12):
  ... → 0.1.10 → 0.1.11 → 0.1.12 → 0.2.0 → 0.2.1 → ...

Overrides via env:
  - BUMP=patch  : force patch++ (no 13th rollover)
  - BUMP=minor  : minor++ ; patch=0
  - BUMP=major  : major++ ; minor=0 ; patch=0

Also updates: VERSION, any top-level or common-subdir package.json, and pyproject.toml
(updates [project].version or [tool.poetry].version if present)
Then stages modified files (git add) so the same commit includes the bump(s).

Keep this fast—it's run in a pre-commit hook.
"""
import json
import os
import re
import subprocess
import sys
from pathlib import Path

SEMVER_RE = re.compile(
    r"^(\d+)\.(\d+)\.(\d+)"
    r"(?:-[0-9A-Za-z.-]+)?"
    r"(?:\+[0-9A-Za-z.-]+)?$"
)

CWD = Path.cwd()
VERSION_PATH = CWD / "VERSION"
# Subdirs to scan lightly for manifests (avoid node_modules, etc.)
SCAN_DIRS = [
    ".", "frontend", "web", "app", "client", "ui", "site",
    "packages", "apps", "services", "backend", "server"
]
IGNORE_DIRS = {"node_modules", ".git", ".venv", "venv", "__pycache__"}

# Roll to next minor when patch reaches this value (i.e., 0..12 → next is .0 and minor++)
PATCH_ROLLOVER = 12


def read_version() -> str:
    if not VERSION_PATH.exists():
        return "0.0.0"
    txt = VERSION_PATH.read_text(encoding="utf-8").strip()
    return txt or "0.0.0"


def parse_semver(v: str):
    m = SEMVER_RE.match(v)
    if not m:
        sys.stderr.write(f"VERSION is not semver-like: {v}\n")
        sys.exit(1)
    return tuple(int(x) for x in m.groups())


def bump(major: int, minor: int, patch: int) -> str:
    """
    Default: roll patch every 13th commit (0..12). On reaching PATCH_ROLLOVER, bump minor and reset patch=0.
    Explicit overrides via BUMP env: major|minor|patch.
    """
    how = os.getenv("BUMP", "").lower().strip()

    if how == "major":
        return f"{major + 1}.0.0"
    if how == "minor":
        return f"{major}.{minor + 1}.0"
    if how == "patch":
        return f"{major}.{minor}.{patch + 1}"

    # Auto (13-step cycle): 0..12 then rollover
    if patch >= PATCH_ROLLOVER:
        return f"{major}.{minor + 1}.0"
    return f"{major}.{minor}.{patch + 1}"


def write_if_changed(path: Path, content: str) -> bool:
    prior = path.read_text(encoding="utf-8") if path.exists() else None
    if prior == content:
        return False
    path.write_text(content, encoding="utf-8")
    return True


def update_VERSION(new_version: str) -> bool:
    return write_if_changed(VERSION_PATH, new_version + "\n")


def find_candidate_files():
    """Return a list of candidate manifest paths to try updating."""
    candidates = []
    for d in SCAN_DIRS:
        p = (CWD / d).resolve()
        if not p.exists() or not p.is_dir():
            continue
        # only check direct children; avoid deep walks that may be slow
        try:
            for child in p.iterdir():
                if child.is_dir():
                    if child.name in IGNORE_DIRS:
                        continue
                    # one level deep: check for package.json / pyproject.toml
                    pkg = child / "package.json"
                    pyt = child / "pyproject.toml"
                    if pkg.exists():
                        candidates.append(pkg)
                    if pyt.exists():
                        candidates.append(pyt)
                else:
                    if child.name in {"package.json", "pyproject.toml"}:
                        candidates.append(child)
        except PermissionError:
            continue
    # de-dup while preserving order
    seen = set()
    out = []
    for c in candidates:
        s = str(c)
        if s not in seen:
            seen.add(s)
            out.append(c)
    return out


def update_package_json(path: Path, new_version: str) -> bool:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        if data.get("version") == new_version:
            return False
        data["version"] = new_version
        # Keep stable formatting (2 spaces) and trailing newline
        txt = json.dumps(data, ensure_ascii=False, indent=2) + "\n"
        return write_if_changed(path, txt)
    except Exception as e:
        sys.stderr.write(f"[warn] Failed updating {path}: {e}\n")
        return False


def update_pyproject_toml(path: Path, new_version: str) -> bool:
    """
    Minimal, formatting-preserving line edit:
    - If inside [project] or [tool.poetry], replace `version = "..."`
    - Do not insert if missing (keep it conservative to avoid surprises)
    """
    try:
        lines = path.read_text(encoding="utf-8").splitlines(keepends=False)
        changed = False
        current_section = None
        target_sections = {"project", "tool.poetry"}
        ver_line_re = re.compile(r'^(\s*version\s*=\s*)(["\'])([^"\']*)(\2)(\s*(#.*)?)?$')

        def in_target(sec: str) -> bool:
            return sec in target_sections

        for i, line in enumerate(lines):
            sec_match = re.match(r"^\s*\[([^\]]+)\]\s*$", line)
            if sec_match:
                current_section = sec_match.group(1).strip()
            elif current_section and in_target(current_section):
                m = ver_line_re.match(line)
                if m:
                    prefix, q, _, q2, suffix = m.group(1), m.group(2), m.group(3), m.group(4), (m.group(5) or "")
                    if q != q2:
                        q = '"'
                    new_line = f"{prefix}{q}{new_version}{q}{suffix}"
                    if new_line != line:
                        lines[i] = new_line
                        changed = True
                        # do not break; there might be another tool section later
        if changed:
            txt = "\n".join(lines) + "\n"
            return write_if_changed(path, txt)
        return False
    except Exception as e:
        sys.stderr.write(f"[warn] Failed updating {path}: {e}\n")
        return False


def git_add(paths):
    try:
        if not paths:
            return
        subprocess.run(["git", "add", "--"] + [str(p) for p in paths], check=False)
    except Exception as e:
        sys.stderr.write(f"[warn] git add failed: {e}\n")


def main():
    cur = read_version()
    mj, mn, pt = parse_semver(cur)
    new = bump(mj, mn, pt)

    updated = []
    if update_VERSION(new):
        updated.append(VERSION_PATH)

    # Sync manifests
    for f in find_candidate_files():
        if f.name == "package.json":
            if update_package_json(f, new):
                updated.append(f)
        elif f.name == "pyproject.toml":
            if update_pyproject_toml(f, new):
                updated.append(f)

    # Stage updated files so they land in this commit
    git_add(updated)

    # Print the version for the calling hook to log
    sys.stdout.write(new)
    sys.stdout.flush()


if __name__ == "__main__":
    main()