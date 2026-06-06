"""Pricing engine for Vantageo quotes.

This module is the **single source of truth** for quote numbers. Per the
project vision (AGENT.md / CLAUDE.md), the LLM must never calculate prices
or invent specs — all pricing and BOM derivation happens here, deterministically,
against hardcoded product/option tables.

For MVP, prices live in Python dicts. The eventual migration to PostgreSQL
(declared in AGENTS.md) is a one-day refactor: swap the constants for a
`pricing_repo.py` that reads the same schema.

The BOM rules are intentionally simple (medium depth):
  - DIMM count  = min(ceil(memory_gb / 32), max_dimm)
  - Drive count = min(ceil(storage_gb / 1000), max_drive)
  - GPU count   = min(gpu_count, max_drive) IF gpu_supported ELSE 0
  - PSU count   = 2  (redundant pair, always)
  - CPU count   = 2  (dual-socket for 2240 family, 1 for 1240)

If the user asks for more than the model supports, the quantity is clamped
and a `notes` string explains the cap so the receipt is transparent about it.
"""
from __future__ import annotations

import math
import random
import string
import time
from typing import Any

# ---------- Issuer / default terms ----------

ISSUER_INFO: dict[str, str] = {
    "name": "Vantageo Private Limited",
    "tagline": "Enterprise Infrastructure Solutions",
    "address": "Mumbai, Maharashtra, India",
    "email": "sales@vantageo.com",
    "phone": "+91-22-XXXX-XXXX",
    "gstin": "27AAACV1234A1Z5",
}

DEFAULT_TERMS: list[str] = [
    "This quotation is valid for 30 days from the issue date.",
    "Prices exclude installation, integration, and shipping.",
    "IGST @ 18% applicable (inter-state supply).",
    "Delivery: 4-6 weeks from confirmed purchase order.",
    "Payment: 50% advance, 50% on delivery.",
    "Standard 3-year on-site warranty included.",
    "Specifications subject to change without notice.",
]

VALIDITY_DAYS: int = 30
TAX_RATE: float = 0.18  # IGST
TAX_LABEL: str = "IGST @ 18%"
QUOTE_STATUS: str = "DRAFT"

# ---------- Pricing tables ----------
# Prices in integer INR (rupees). Edit freely before the demo.

BASE_PRICE_INR: dict[str, int] = {
    "Vantageo 1240-RG":  385_000,
    "Vantageo 2240":      565_000,
    "Vantageo 2240-RG":   599_000,
    "Vantageo 2240-RM":   720_000,
    "Vantageo 2240-RE":   795_000,
}

# Per-unit option prices (multiplied by quantity in BOM).
OPTION_PRICE_INR: dict[str, int] = {
    "CPU-XEON-5G":     125_000,
    "DIMM-32G-DDR5":    18_500,
    "SSD-1T-NVME":      32_000,
    "GPU-NVIDIA-L4":   280_000,
    "PSU-2000W-CRPS":   48_000,
}

OPTION_LABEL: dict[str, str] = {
    "CPU-XEON-5G":     "5th Gen Intel Xeon Scalable Processor",
    "DIMM-32G-DDR5":   "32GB DDR5 RDIMM 5600 MT/s",
    "SSD-1T-NVME":     "1TB NVMe U.2 Enterprise SSD",
    "GPU-NVIDIA-L4":   "NVIDIA L4 Tensor Core GPU",
    "PSU-2000W-CRPS":  "2000W CRPS 80 PLUS Platinum PSU",
}

# Per-model physical/electrical limits and form factor.
MAX_CONFIG: dict[str, dict[str, Any]] = {
    "Vantageo 1240-RG": {
        "form_factor": "1U Rack Server",
        "max_cpu": 1,
        "max_dimm": 8,
        "max_drive": 8,
        "gpu_supported": False,
        "default_cpu": 1,
        "default_dimm_gb": 64,
        "default_drive_gb": 1000,
    },
    "Vantageo 2240": {
        "form_factor": "2U Rack Server",
        "max_cpu": 2,
        "max_dimm": 32,
        "max_drive": 12,
        "gpu_supported": True,
        "default_cpu": 2,
        "default_dimm_gb": 256,
        "default_drive_gb": 2000,
    },
    "Vantageo 2240-RG": {
        "form_factor": "2U Rack Server",
        "max_cpu": 2,
        "max_dimm": 32,
        "max_drive": 12,
        "gpu_supported": True,
        "default_cpu": 2,
        "default_dimm_gb": 256,
        "default_drive_gb": 2000,
    },
    "Vantageo 2240-RM": {
        "form_factor": "2U Rack Server",
        "max_cpu": 2,
        "max_dimm": 32,
        "max_drive": 24,
        "gpu_supported": True,
        "default_cpu": 2,
        "default_dimm_gb": 512,
        "default_drive_gb": 4000,
    },
    "Vantageo 2240-RE": {
        "form_factor": "2U Rack Server",
        "max_cpu": 2,
        "max_dimm": 32,
        "max_drive": 24,
        "gpu_supported": True,
        "default_cpu": 2,
        "default_dimm_gb": 512,
        "default_drive_gb": 4000,
    },
}


# ---------- Helpers ----------

def _short_id() -> str:
    """4-char random hex suffix, e.g. 'A4F2'."""
    return "".join(random.choices(string.ascii_uppercase + string.digits, k=4))


def _format_date(ts: float) -> str:
    """ISO-like YYYY-MM-DD. No timezone gymnastics — local date is fine for receipts."""
    return time.strftime("%Y-%m-%d", time.localtime(ts))


def _ceil_div(a: int, b: int) -> int:
    """Ceiling division, integer-safe."""
    if a <= 0:
        return 0
    return (a + b - 1) // b


def _resolve_model(model: str) -> str:
    """Canonicalize model name. Accepts '2240-RG', 'Vantageo 2240-RG', or
    any case variant. Returns the canonical `Vantageo <name>` form or raises."""
    if not model:
        raise ValueError("model is required")
    raw = str(model).strip()
    if not raw:
        raise ValueError("model is required")
    # Strip leading "Vantageo " if present, then re-attach.
    bare = raw.lower().replace("vantageo", "").strip()
    # bare is now e.g. "2240-rg"
    for canonical in BASE_PRICE_INR:
        bare_canonical = canonical.lower().replace("vantageo", "").strip()
        if bare == bare_canonical:
            return canonical
    raise ValueError(
        f"Unknown model '{model}'. Known: {', '.join(BASE_PRICE_INR.keys())}"
    )


# ---------- Public API ----------

def calculate_quote(
    model: str,
    quantity: int = 1,
    memory_gb: int = 0,
    storage_gb: int = 0,
    gpu_count: int = 0,
    customer: dict[str, str | None] | None = None,
    use_case: str | None = None,
    now: float | None = None,
) -> dict:
    """Build a full quote receipt.

    Args:
        model:       Canonical or near-canonical model name (case-insensitive).
        quantity:    Number of units (>= 1).
        memory_gb:   Requested total memory per unit in GB (0 = use model default).
        storage_gb:  Requested total storage per unit in GB (0 = use model default).
        gpu_count:   Requested number of GPUs per unit (0 = none; ignored if model
                     does not support GPUs).
        customer:    Dict with optional keys name, company, email, phone.
        use_case:    Free-text use case shown in the configuration summary.
        now:         Override for the issue timestamp (testing only).

    Returns:
        Receipt dict matching the QuoteReceipt TypeScript type. All money values
        are integer INR. `notes` is a list of human-readable strings (empty if
        no caps were triggered).
    """
    canonical = _resolve_model(model)
    cfg = MAX_CONFIG[canonical]
    qty = max(1, int(quantity or 1))

    requested_memory = int(memory_gb or 0) or cfg["default_dimm_gb"]
    requested_storage = int(storage_gb or 0) or cfg["default_drive_gb"]
    requested_gpu = max(0, int(gpu_count or 0))

    notes: list[str] = []

    # DIMM count: 32 GB per DIMM, capped at model max.
    max_memory_gb = cfg["max_dimm"] * 32
    if requested_memory > max_memory_gb:
        notes.append(
            f"Requested {requested_memory} GB memory — capped at model maximum of "
            f"{max_memory_gb} GB ({cfg['max_dimm']} × 32 GB DIMM)."
        )
    effective_memory_gb = min(requested_memory, max_memory_gb)
    dimm_qty = _ceil_div(effective_memory_gb, 32)

    # Drive count: 1 TB per SSD, capped at model max.
    max_storage_gb = cfg["max_drive"] * 1000
    if requested_storage > max_storage_gb:
        notes.append(
            f"Requested {requested_storage} GB storage — capped at model maximum of "
            f"{max_storage_gb} GB ({cfg['max_drive']} × 1 TB SSD)."
        )
    effective_storage_gb = min(requested_storage, max_storage_gb)
    drive_qty = _ceil_div(effective_storage_gb, 1000)

    # GPU: cap to model support and physical slot limit (assume 2 per 2U for demo).
    max_gpu = 2 if cfg["gpu_supported"] else 0
    if requested_gpu > 0 and not cfg["gpu_supported"]:
        notes.append(
            f"{canonical} does not support discrete GPUs; GPU option omitted."
        )
    elif requested_gpu > max_gpu:
        notes.append(
            f"Requested {requested_gpu} GPU(s) — capped at model maximum of {max_gpu}."
        )
    gpu_qty = min(requested_gpu, max_gpu)

    # CPU + PSU are fixed defaults.
    cpu_qty = cfg["default_cpu"]
    psu_qty = 2

    # Build line items. Each line: SKU, description, qty (per unit), unit_price, line_total = qty * unit_price * qty_units.
    line_items: list[dict] = []
    base_unit = BASE_PRICE_INR[canonical]
    line_items.append({
        "sku": f"BASE-{canonical.replace('Vantageo ', '')}",
        "description": f"{canonical} ({cfg['form_factor']})",
        "quantity": qty,
        "unit_price": base_unit,
        "line_total": base_unit * qty,
    })
    if cpu_qty > 0:
        line_items.append({
            "sku": "CPU-XEON-5G",
            "description": OPTION_LABEL["CPU-XEON-5G"],
            "quantity": cpu_qty * qty,
            "unit_price": OPTION_PRICE_INR["CPU-XEON-5G"],
            "line_total": OPTION_PRICE_INR["CPU-XEON-5G"] * cpu_qty * qty,
        })
    if dimm_qty > 0:
        line_items.append({
            "sku": "DIMM-32G-DDR5",
            "description": OPTION_LABEL["DIMM-32G-DDR5"],
            "quantity": dimm_qty * qty,
            "unit_price": OPTION_PRICE_INR["DIMM-32G-DDR5"],
            "line_total": OPTION_PRICE_INR["DIMM-32G-DDR5"] * dimm_qty * qty,
        })
    if drive_qty > 0:
        line_items.append({
            "sku": "SSD-1T-NVME",
            "description": OPTION_LABEL["SSD-1T-NVME"],
            "quantity": drive_qty * qty,
            "unit_price": OPTION_PRICE_INR["SSD-1T-NVME"],
            "line_total": OPTION_PRICE_INR["SSD-1T-NVME"] * drive_qty * qty,
        })
    if gpu_qty > 0:
        line_items.append({
            "sku": "GPU-NVIDIA-L4",
            "description": OPTION_LABEL["GPU-NVIDIA-L4"],
            "quantity": gpu_qty * qty,
            "unit_price": OPTION_PRICE_INR["GPU-NVIDIA-L4"],
            "line_total": OPTION_PRICE_INR["GPU-NVIDIA-L4"] * gpu_qty * qty,
        })
    if psu_qty > 0:
        line_items.append({
            "sku": "PSU-2000W-CRPS",
            "description": OPTION_LABEL["PSU-2000W-CRPS"],
            "quantity": psu_qty * qty,
            "unit_price": OPTION_PRICE_INR["PSU-2000W-CRPS"],
            "line_total": OPTION_PRICE_INR["PSU-2000W-CRPS"] * psu_qty * qty,
        })

    subtotal = sum(li["line_total"] for li in line_items)
    tax_amount = round(subtotal * TAX_RATE)
    total = subtotal + tax_amount

    issue_ts = now if now is not None else time.time()
    issue_date = _format_date(issue_ts)
    valid_until_ts = issue_ts + VALIDITY_DAYS * 86400
    valid_until = _format_date(valid_until_ts)

    cust = customer or {}
    return {
        "receipt_id": f"RCP-{issue_date.replace('-', '')}-{_short_id()}",
        "issue_date": issue_date,
        "valid_until": valid_until,
        "status": QUOTE_STATUS,
        "currency": "INR",
        "issuer": dict(ISSUER_INFO),
        "customer": {
            "name": (cust.get("name") or "").strip() or None,
            "company": (cust.get("company") or "").strip() or None,
            "email": (cust.get("email") or "").strip() or None,
            "phone": (cust.get("phone") or "").strip() or None,
        },
        "configuration": {
            "model": canonical,
            "form_factor": cfg["form_factor"],
            "quantity": qty,
            "use_case": (use_case or "").strip() or None,
        },
        "line_items": line_items,
        "subtotal": subtotal,
        "tax_rate": TAX_RATE,
        "tax_label": TAX_LABEL,
        "tax_amount": tax_amount,
        "total": total,
        "terms": list(DEFAULT_TERMS),
        "notes": notes or None,
        "generated_at": int(issue_ts),
    }


# ---------- Smoke test ----------
if __name__ == "__main__":  # python lib/pricing.py
    import json
    sample = calculate_quote(
        "2240-RG",
        memory_gb=256,
        storage_gb=4000,
        customer={"name": "Rajesh Kumar", "company": "Acme Corporation", "email": "rajesh@acme.in"},
        use_case="AI inference",
    )
    print(json.dumps(sample, indent=2, default=str))
