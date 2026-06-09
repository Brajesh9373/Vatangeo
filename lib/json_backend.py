"""
JSON-backed tool functions — fallback for environments without FalkorDB
(e.g. Render free tier, any platform with no graph database). Reads the
same normalized product JSONs that `scripts/build_graph.py` loads into
FalkorDB, and exposes the same `tool_*` API as `graph_queries.py` with
a compatible return shape.

Picked automatically by `graph_queries.py` when FalkorDB is unreachable
or when `VANTAGEO_DATA_BACKEND=json` is set. The frontend cannot tell
the difference — the tool results are byte-compatible with the graph
backend's output (same key names, same nesting).
"""
import json
import logging
import os
from pathlib import Path
from typing import Any

LOG = logging.getLogger("vantageo.json_backend")

DATA_DIR = Path(__file__).resolve().parent.parent / "json_formate"

# Same canonical model aliases as graph_queries.py so get_product_spec
# works identically. Keep in sync.
MODEL_MAP: dict[str, str] = {
    "1240": "Vantageo 1240-RG", "1240-rg": "Vantageo 1240-RG",
    "2240": "Vantageo 2240", "2240-base": "Vantageo 2240",
    "2240-rg": "Vantageo 2240-RG", "2240-rgspec": "Vantageo 2240-RG",
    "2240-rm": "Vantageo 2240-RM", "2240-re": "Vantageo 2240-RE",
    "4440": "Vantageo 4440", "4440-re": "Vantageo 4440",
}

VALID_MODELS = set(MODEL_MAP.values())

# Module-level cache loaded lazily on first access. The data is small
# (~25KB total) and read-only, so we hold it in memory.
_PRODUCTS: dict[str, dict] = {}


def _load_all() -> dict[str, dict]:
    """Load every JSON in `json_formate/`, index by canonical product name.
    Logs and skips files that fail to parse."""
    global _PRODUCTS
    if _PRODUCTS:
        return _PRODUCTS
    if not DATA_DIR.is_dir():
        LOG.warning("json_formate/ directory not found at %s — JSON backend has no data", DATA_DIR)
        return _PRODUCTS
    for fp in sorted(DATA_DIR.glob("*.json")):
        try:
            with open(fp, "r", encoding="utf-8") as f:
                data = json.load(f)
        except (OSError, json.JSONDecodeError) as e:
            LOG.warning("Skipping %s: %s", fp.name, e)
            continue
        canonical = data.get("product") or MODEL_MAP.get(fp.stem.lower())
        if not canonical:
            LOG.warning("Skipping %s: no 'product' field and no MODEL_MAP match", fp.name)
            continue
        _PRODUCTS[canonical] = data
    LOG.info("JSON backend loaded %d products from %s", len(_PRODUCTS), DATA_DIR)
    return _PRODUCTS


def reload() -> None:
    """Force reload of json_formate/. Used by tests and the dev workflow
    when someone edits a JSON and wants to see changes without restart."""
    global _PRODUCTS
    _PRODUCTS = {}
    _load_all()


def normalize_model(name: str) -> str | None:
    """Same alias-resolution logic as graph_queries.normalize_model —
    duplicated so the JSON backend is self-contained. The contract is
    that any input the graph backend can canonicalize, this can too."""
    if not name or not name.strip():
        return None
    s = name.lower().replace(" ", "").replace("_", "-")
    if s in MODEL_MAP:
        return MODEL_MAP[s]
    for key, val in MODEL_MAP.items():
        if s.startswith(key):
            return val
    for key, val in MODEL_MAP.items():
        if key in s or s in key:
            return val
    return None


# ============= Schema conversion =============
#
# The normalized JSON files use a flat schema (see scripts/normalize_json.py).
# The graph backend's `_assemble_spec` returns a slightly different shape
# (it has `psu` not `power_supply`, and a top-level `firmware` extracted
# from `management`). The frontend renders this spec dict directly via
# `ToolResultView`, so the two backends must produce compatible output.

def _convert_to_spec(raw: dict) -> dict:
    """Normalize a json_formate record into the shape that
    `graph_queries._assemble_spec` returns. Empty values are stripped
    to match the graph backend's `_clean` helper behavior."""
    mgmt = raw.get("management", {})
    psu = raw.get("power_supply", {})
    features = list(raw.get("key_features", [])) + list(raw.get("applications", []))
    security_list = raw.get("security", {}).get("features", [])
    if not security_list and raw.get("security", {}).get("tpm"):
        security_list = [raw["security"]["tpm"]]

    physical = {}
    if raw.get("dimensions"):
        physical.update(raw["dimensions"])
    if raw.get("weight"):
        physical.update(raw["weight"])

    spec: dict[str, Any] = {
        "model": raw.get("product", ""),
        "form_factor": raw.get("form_factor", ""),
        "processor": dict(raw.get("processor", {})),
        "chipset": raw.get("chipset", ""),
        "memory": dict(raw.get("memory", {})),
        "storage": dict(raw.get("storage", {})),
        "raid": dict(raw.get("raid", {})),
        "expansion_slots": list(raw.get("expansion_slots", [])),
        "networking": dict(raw.get("networking", {})),
        "psu": dict(psu) if isinstance(psu, dict) else {"description": psu},
        "cooling": dict(raw.get("cooling", {})),
        "management": dict(mgmt) if isinstance(mgmt, dict) else {"description": mgmt},
        "security": list(security_list),
        "tpm": dict(raw.get("tpm", {})),
        "bios": dict(raw.get("bios", {})),
        "os_support": list(raw.get("os_support", [])),
        "features": list(features),
        "physical": dict(physical),
        "video": dict(raw.get("video", {})),
        "front_io": dict(raw.get("front_io", {})),
        "rear_io": dict(raw.get("rear_io", {})),
        "interconnect": dict(raw.get("interconnect", {})),
        "firmware": mgmt.get("firmware", "") if isinstance(mgmt, dict) else "",
    }
    return {k: v for k, v in spec.items() if v not in (None, "", [], {})}


# ============= TOOLS =============

def tool_list_models() -> list[dict]:
    """List all products with a brief summary. Mirrors the graph backend's
    projection: model, form_factor, ff_detail, max_tdp_w, dimm_slots,
    memory_type. Sorted by canonical name for stable output."""
    products = _load_all()
    rows: list[dict] = []
    for canonical in sorted(products):
        raw = products[canonical]
        mem = raw.get("memory", {})
        proc = raw.get("processor", {})
        ff = raw.get("form_factor", "")
        rows.append({
            "model": canonical,
            "form_factor": ff,
            "ff_detail": ff.split(" ")[0] if ff else "",
            "max_tdp_w": proc.get("max_tdp_w") if isinstance(proc, dict) else None,
            "dimm_slots": mem.get("dimm_slots", 0) if isinstance(mem, dict) else 0,
            "memory_type": mem.get("memory_type", "") if isinstance(mem, dict) else "",
        })
    return rows


def tool_get_spec(model: str) -> dict:
    """Get the full spec for one product. Same return shape as the
    graph backend's `tool_get_spec` — errors are returned as
    `{"error": "..."}` dicts (never raised) so the chat stream can
    surface them to the LLM."""
    products = _load_all()
    canonical = normalize_model(model)
    if not canonical:
        return {
            "error": (
                f"Unknown model '{model}'. Known models: "
                "1240-RG, 2240, 2240-RG, 2240-RM, 2240-RE."
            )
        }
    raw = products.get(canonical)
    if not raw:
        return {"error": f"Product {canonical} not found in json_formate/"}
    return _convert_to_spec(raw)


def tool_find_by_requirement(
    form_factor: str = "",
    min_dimm: int = 0,
    sockets: int = 0,
    min_storage_bays: int = 0,
    use_case: str = "",
) -> dict:
    """Find products matching the user's requirements. Mirrors the
    graph backend's contract: AND-combined filters, empty/zero args
    ignored, junk strings coerced to empty. Returns
    `{"matched": N, "filters": {...}, "models": {...full specs...}}`."""
    if str(form_factor).lower() in ("", "user_input", "none", "null", "undefined"):
        form_factor = ""
    if str(use_case).lower() in ("", "user_input", "none", "null", "undefined"):
        use_case = ""

    try:
        min_dimm = int(min_dimm) if str(min_dimm).isdigit() else 0
    except (ValueError, TypeError):
        min_dimm = 0
    try:
        sockets = int(sockets) if str(sockets).isdigit() else 0
    except (ValueError, TypeError):
        sockets = 0
    try:
        min_storage_bays = int(min_storage_bays) if str(min_storage_bays).isdigit() else 0
    except (ValueError, TypeError):
        min_storage_bays = 0

    products = _load_all()
    matches: list[str] = []
    ff_lower = form_factor.lower()
    uc_lower = use_case.lower()

    for canonical, raw in products.items():
        if ff_lower and ff_lower not in raw.get("form_factor", "").lower():
            continue
        mem = raw.get("memory", {}) if isinstance(raw.get("memory"), dict) else {}
        if min_dimm > 0 and (mem.get("dimm_slots") or 0) < min_dimm:
            continue
        proc = raw.get("processor", {}) if isinstance(raw.get("processor"), dict) else {}
        if sockets > 0 and (proc.get("sockets") or 0) < sockets:
            continue
        st = raw.get("storage", {}) if isinstance(raw.get("storage"), dict) else {}
        bays = (
            (st.get("drive_bays") or 0)
            + (st.get("max_2_5_bays") or 0)
            + (st.get("max_3_5_bays") or 0)
        )
        if min_storage_bays > 0 and bays < min_storage_bays:
            continue
        if uc_lower:
            apps = " ".join(raw.get("applications", [])).lower()
            features = " ".join(raw.get("key_features", [])).lower()
            if uc_lower not in apps and uc_lower not in features:
                continue
        matches.append(canonical)

    matches.sort()
    applied = {
        k: v for k, v in {
            "form_factor": form_factor,
            "min_dimm": min_dimm,
            "sockets": sockets,
            "min_storage_bays": min_storage_bays,
            "use_case": use_case,
        }.items() if v
    }

    # Return lightweight summaries instead of full specs to reduce
    # the context payload sent to the second LLM call.
    summaries = {}
    for m in matches:
        raw = products.get(m, {})
        proc = raw.get("processor", {}) if isinstance(raw.get("processor"), dict) else {}
        mem = raw.get("memory", {}) if isinstance(raw.get("memory"), dict) else {}
        st = raw.get("storage", {}) if isinstance(raw.get("storage"), dict) else {}
        summaries[m] = {
            "model": m,
            "form_factor": raw.get("form_factor", ""),
            "processor": proc.get("model", "") or proc.get("name", ""),
            "memory_slots": mem.get("dimm_slots", ""),
            "memory_type": mem.get("memory_type", ""),
            "storage_bays": (
                (st.get("drive_bays") or 0)
                + (st.get("max_2_5_bays") or 0)
                + (st.get("max_3_5_bays") or 0)
            ),
        }
    return {
        "matched": len(matches),
        "filters": applied,
        "models": summaries,
    }


def tool_compare(products: list[str]) -> dict:
    """Compare multiple products. Same shape as graph backend:
    `{"Vantageo 1240-RG": {spec...}, "Vantageo 2240-RM": {spec...}}`."""
    return {p: tool_get_spec(p) for p in products}


# ============= TEST =============

if __name__ == "__main__":
    print("Models:", [p["model"] for p in tool_list_models()])
    print()
    print("2240-RM spec keys:", sorted(tool_get_spec("2240-RM").keys()))
    print()
    print("Find 2U:", tool_find_by_requirement(form_factor="2U"))
