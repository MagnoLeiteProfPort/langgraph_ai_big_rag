from __future__ import annotations

from pathlib import Path
from typing import Tuple

def _parse_version(path: Path) -> Tuple[str, int]:
    """
    Parse a versioned filename of the form:
      base.ext
      base__v1.ext
      base__v2.ext
    Returns (base, version_int).
    """
    stem = path.stem
    if "__v" in stem:
        base, vpart = stem.rsplit("__v", 1)
        if vpart.isdigit():
            return base, int(vpart)
    return stem, 0


def resolve_latest_version(original: Path) -> Path:
    """
    Given a path (original or versioned), find the highest version sibling.
    If no versions exist, return the original path.
    """
    base, _ = _parse_version(original)
    suffix = original.suffix
    parent = original.parent

    best_version = -1
    best_path = None

    for p in parent.iterdir():
        if not p.is_file():
            continue
        if p.suffix != suffix:
            continue
        b, v = _parse_version(p)
        if b == base and v > best_version:
            best_version = v
            best_path = p

    if best_path is None:
        return original

    return best_path


def get_next_version_path(latest: Path) -> Path:
    """
    Given the current latest version of a file, return a new path with version+1.
    """
    base, v = _parse_version(latest)
    suffix = latest.suffix
    parent = latest.parent
    next_v = v + 1
    return parent / f"{base}__v{next_v}{suffix}"
