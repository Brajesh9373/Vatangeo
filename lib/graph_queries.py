"""
Graph Query Layer — Secure, batched FalkorDB queries for the chatbot.
Normalizes model names (user says "2240-RM", graph has "Vantageo 2240-RM").
All queries use exact match on canonical product names — no CONTAINS.

Backends
--------
At import time this module picks one of two backends:

* **FalkorDB** (default for local dev) — connects to localhost:6380,
  runs Cypher queries against the `vantageo` graph. Build the graph
  with `python scripts/build_graph.py`.

* **JSON** (auto-fallback / explicit) — reads the same product data
  from `json_formate/*.json` (the same files `build_graph.py` loads).
  Use this for environments without a graph database (Render free tier,
  any host that only ships a stateless Python runtime).

Override the choice with `VANTAGEO_DATA_BACKEND`:

  * `auto`     — try FalkorDB, fall back to JSON (default)
  * `falkordb` — require FalkorDB; raise at startup if unreachable
  * `json`     — skip the network call, use JSON files

The two backends return byte-compatible dicts from `tool_list_models`,
`tool_get_spec`, `tool_find_by_requirement`, and `tool_compare` so the
frontend can't tell them apart.
"""
import json
import logging
import os

LOG = logging.getLogger("vantageo.graph_queries")

# ============= BACKEND SELECTION =============


def _try_falkordb() -> tuple[bool, str]:
    """Test if FalkorDB is reachable. Returns (ok, error_msg)."""
    try:
        from falkordb import FalkorDB
        host = os.environ.get("FALKORDB_HOST", "localhost")
        port = int(os.environ.get("FALKORDB_PORT", "6380"))
        db = FalkorDB(host=host, port=port)
        db.select_graph("vantageo").query("RETURN 1 AS ok")
        return True, ""
    except Exception as e:
        return False, f"{type(e).__name__}: {e}"


_choice = os.environ.get("VANTAGEO_DATA_BACKEND", "auto").lower()
if _choice not in ("auto", "falkordb", "json"):
    _choice = "auto"

_USE_JSON = False

if _choice == "json":
    _USE_JSON = True
    LOG.info("VANTAGEO_DATA_BACKEND=json — using JSON backend (json_formate/)")
elif _choice == "falkordb":
    ok, err = _try_falkordb()
    if not ok:
        raise RuntimeError(
            f"VANTAGEO_DATA_BACKEND=falkordb but FalkorDB is unreachable: {err}"
        )
    LOG.info("VANTAGEO_DATA_BACKEND=falkordb — using graph backend")
else:  # auto
    ok, err = _try_falkordb()
    if ok:
        LOG.info("FalkorDB reachable — using graph backend")
    else:
        _USE_JSON = True
        LOG.info("FalkorDB unreachable (%s) — using JSON backend", err)


# ============= JSON BACKEND (fallback) =============

if _USE_JSON:
    from . import json_backend as _jb

    tool_list_models = _jb.tool_list_models
    tool_get_spec = _jb.tool_get_spec
    tool_find_by_requirement = _jb.tool_find_by_requirement
    tool_compare = _jb.tool_compare
    normalize_model = _jb.normalize_model
    MODEL_MAP = _jb.MODEL_MAP
    VALID_MODELS = _jb.VALID_MODELS

    # Stubs so `from lib.graph_queries import _g` doesn't break callers
    # that probe for the graph connection (e.g. the health check).
    DB = None
    GRAPH_NAME = None
    _g = None
    _row = None


# ============= FalkorDB BACKEND (default for local dev) =============

else:
    from falkordb import FalkorDB

    DB = FalkorDB(
        host=os.environ.get("FALKORDB_HOST", "localhost"),
        port=int(os.environ.get("FALKORDB_PORT", "6380")),
    )
    GRAPH_NAME = "vantageo"

    MODEL_MAP = {
        "1240": "Vantageo 1240-RG", "1240-rg": "Vantageo 1240-RG",
        "2240": "Vantageo 2240", "2240-base": "Vantageo 2240",
        "2240-rg": "Vantageo 2240-RG", "2240-rgspec": "Vantageo 2240-RG",
        "2240-rm": "Vantageo 2240-RM", "2240-re": "Vantageo 2240-RE",
        "4440": "Vantageo 4440", "4440-re": "Vantageo 4440",
    }

    VALID_MODELS = set(MODEL_MAP.values())

    def _g():
        return DB.select_graph(GRAPH_NAME)

    def _row(query):
        """Execute a Cypher query and return results as list of dicts."""
        try:
            r = _g().query(query)
        except Exception as e:
            return [{"_error": f"Graph DB error: {e}"}]
        if not r or not r.result_set:
            return []
        cols = [c[1] for c in r.header] if r.header else []
        rows = []
        for res in r.result_set:
            d = {}
            for i, val in enumerate(res):
                cn = cols[i] if i < len(cols) else f"col{i}"
                if hasattr(val, "properties"):
                    d[cn] = dict(val.properties) if val.properties else {}
                else:
                    d[cn] = val
            rows.append(d)
        return rows

    def normalize_model(name: str) -> str | None:
        """Convert user input ('2240RM', '2240-rm', '1240') → canonical graph name.
        Returns None if the model cannot be matched to a known product."""
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

    def _safe_quote(s: str) -> str:
        """Escape single quotes and backslashes for Cypher string literals.
        Used only for canonical names already validated against MODEL_MAP,
        as a defense-in-depth measure."""
        return s.replace("\\", "\\\\").replace("'", "\\'")

    # ============= BATCHED PRODUCT LOOKUP =============

    def _fetch_product_sections(canonical: str) -> dict:
        """Fetch all product component sections in batched queries.
        Query 1: single-value relationships (form_factor, processor, chipset,
                 memory, storage, raid, psu, cooling, management, tpm,
                 physical, bios).
        Query 2: multi-value relationships via UNION ALL (families, DIMMs,
                 slots, security, OS, features).
        Query 3: remaining single-value components (networking, video,
                 front/rear IO, interconnect, firmware).

        Down from the original 9 sequential queries to 3."""
        q = _safe_quote(canonical)

        # Batch 1 — all single-value components
        b1 = _row(f"""
            MATCH (p:Product {{product: '{q}'}})
            OPTIONAL MATCH (p)-[:HAS_FORM_FACTOR]->(f:FormFactor)
            OPTIONAL MATCH (p)-[:SUPPORTS_PROCESSOR]->(cpu:Processor)
            OPTIONAL MATCH (p)-[:USES]->(c:Chipset)
            OPTIONAL MATCH (p)-[:HAS_MEMORY]->(mem:Memory)
            OPTIONAL MATCH (p)-[:HAS_STORAGE]->(s:Storage)
            OPTIONAL MATCH (p)-[:SUPPORTS_RAID]->(ra:RAID)
            OPTIONAL MATCH (p)-[:HAS_PSU]->(ps:PSU)
            OPTIONAL MATCH (p)-[:HAS_COOLING]->(cl:Cooling)
            OPTIONAL MATCH (p)-[:HAS_MANAGEMENT]->(bm:BMC)
            OPTIONAL MATCH (p)-[:HAS_TPM]->(tp:TPM)
            OPTIONAL MATCH (p)-[:HAS_BIOS]->(bios:BIOS)
            OPTIONAL MATCH (p)-[:HAS_PHYSICAL]->(pw:Physical)
            RETURN f, cpu, c, mem, s, ra, ps, cl, bm, tp, bios, pw
        """)

        if not b1 or b1[0].get("_error"):
            return {"_error": b1[0]["_error"] if b1 else "Product not found in graph"}

        row1 = b1[0]

        # Batch 2 — all multi-value components in a single UNION ALL query.
        # Each sub-query returns a distinct _src column so _assemble_spec
        # can tell which rows belong to which relationship.
        b2 = _row(f"""
            MATCH (p:Product {{product: '{q}'}})
            OPTIONAL MATCH (p)-[:SUPPORTS_FAMILY]->(pf:ProcessorFamily)
            RETURN 'families' AS _src, pf.full_name AS key1, NULL AS key2, NULL AS key3,
                   NULL AS key4, NULL AS key5, NULL AS key6
            UNION ALL
            MATCH (p:Product {{product: '{q}'}})
            OPTIONAL MATCH (p)-[:SUPPORTS_DIMM]->(d:DIMM)
            RETURN 'dimms' AS _src, d.capacity AS key1, d.dimm_type AS key2, NULL AS key3,
                   NULL AS key4, NULL AS key5, NULL AS key6
            UNION ALL
            MATCH (p:Product {{product: '{q}'}})
            OPTIONAL MATCH (p)-[:HAS_SLOT]->(sl:Slot)
            RETURN 'slots' AS _src, sl.slot AS key1, sl.generation AS key2,
                   sl.signal AS key3, sl.source AS key4, sl.supports AS key5, sl.count AS key6
            UNION ALL
            MATCH (p:Product {{product: '{q}'}})
            OPTIONAL MATCH (p)-[:HAS_SECURITY]->(sf:SecurityFeature)
            RETURN 'security' AS _src, sf.name AS key1, NULL AS key2, NULL AS key3,
                   NULL AS key4, NULL AS key5, NULL AS key6
            UNION ALL
            MATCH (p:Product {{product: '{q}'}})
            OPTIONAL MATCH (p)-[:SUPPORTS_OS]->(os:OS)
            RETURN 'os' AS _src, os.full_name AS key1, NULL AS key2, NULL AS key3,
                   NULL AS key4, NULL AS key5, NULL AS key6
            UNION ALL
            MATCH (p:Product {{product: '{q}'}})
            OPTIONAL MATCH (p)-[:HAS_FEATURE]->(kf:KeyFeature)
            RETURN 'features' AS _src, kf.description AS key1, NULL AS key2, NULL AS key3,
                   NULL AS key4, NULL AS key5, NULL AS key6
        """)

        # Split b2 rows by _src back into per-type groups
        b2_by_src: dict[str, list[dict]] = {}
        for row in b2:
            src = row.pop("_src", None)
            if src:
                b2_by_src.setdefault(src, []).append(row)

        # Batch 3 — remaining single-value components
        b3 = _row(f"""
            MATCH (p:Product {{product: '{q}'}})
            OPTIONAL MATCH (p)-[:HAS_NETWORKING]->(net:NIC)
            OPTIONAL MATCH (p)-[:HAS_VIDEO]->(vid:Video)
            OPTIONAL MATCH (p)-[:HAS_FRONT_IO]->(fio:FrontIO)
            OPTIONAL MATCH (p)-[:HAS_REAR_IO]->(rio:RearIO)
            OPTIONAL MATCH (p)-[:HAS_INTERCONNECT]->(ic:Interconnect)
            OPTIONAL MATCH (p)-[:HAS_FIRMWARE]->(fw:Firmware)
            RETURN net, vid, fio, rio, ic, fw
        """)

        return _assemble_spec(
            canonical, row1,
            b2_by_src.get("families", []),
            b2_by_src.get("dimms", []),
            b2_by_src.get("slots", []),
            b2_by_src.get("security", []),
            b2_by_src.get("os", []),
            b2_by_src.get("features", []),
            b3,
        )

    def _first_prop(rows, key=None):
        """Extract first row's properties dict, or a single value from a key."""
        if not rows:
            return {}
        first = rows[0]
        if key:
            node = first.get(key)
            return dict(node.properties) if node and hasattr(node, "properties") and node.properties else {}
        return first

    def _collect_prop(rows, key, prop):
        """Collect a property value from all rows for a given node key.
        _row() already flattened Node → property dicts, so we access dict keys directly."""
        result = []
        seen = set()
        for row in rows:
            node = row.get(key)
            if isinstance(node, dict):
                val = node.get(prop)
                if val and val not in seen:
                    seen.add(val)
                    result.append(val)
        return result

    def _assemble_spec(canonical: str, row1: dict, b2_families: list, b2_dimms: list,
                       b2_slots: list, b2_security: list, b2_os: list, b2_features: list,
                       b3: list) -> dict:
        """Build the spec dict from batched query results.
        _row() already flattens Node objects → property dicts, so we access values directly."""
        result = {
            "model": canonical,
            "form_factor": "",
            "processor": {},
            "chipset": "",
            "memory": {},
            "storage": {},
            "raid": {},
            "expansion_slots": [],
            "networking": {},
            "psu": {},
            "cooling": {},
            "management": {},
            "security": [],
            "tpm": {},
            "bios": {},
            "os_support": [],
            "features": [],
            "physical": {},
        }

        def _val(key, subkey=None):
            v = row1.get(key) or {}
            if isinstance(v, dict) and subkey:
                return v.get(subkey, "")
            return v if isinstance(v, dict) else {}

        def _clean(d):
            return {k: v for k, v in d.items() if v}

        # Form Factor
        result["form_factor"] = _val("f", "name")

        # Processor
        cpu = _val("cpu")
        if cpu: result["processor"] = _clean(cpu)

        # Processor families (b2 rows use key1 = full_name)
        families = []
        seen = set()
        for row in b2_families:
            v = row.get("key1")
            if v and v not in seen:
                seen.add(v)
                families.append(v)
        result["processor"]["families"] = families

        # Chipset
        result["chipset"] = _val("c", "name")

        # Memory
        mem = _val("mem")
        if mem: result["memory"] = _clean(mem)

        # DIMMs (b2 rows: key1=capacity, key2=dimm_type)
        dimms = []
        seen_dimm = set()
        for row in b2_dimms:
            cap = row.get("key1")
            dtype = row.get("key2")
            if cap and (cap, dtype) not in seen_dimm:
                seen_dimm.add((cap, dtype))
                dimms.append({"capacity": cap, "type": dtype})
        if dimms: result["memory"]["dimms"] = dimms

        # Storage
        result["storage"] = _clean(_val("s"))

        # RAID
        ra = _val("ra")
        if ra: result["raid"] = {"controller": ra.get("controller", ""), "levels": ra.get("levels", "")}

        # Expansion slots (b2 rows: key1=slot, key2=gen, key3=sig, key4=source, key5=supports, key6=count)
        for row in b2_slots:
            clean = {}
            mapping = {"key1": "slot", "key2": "gen", "key3": "sig",
                       "key4": "source", "key5": "supports", "key6": "count"}
            for k, label in mapping.items():
                v = row.get(k)
                if v is not None and v != "" and v != 0 and v != "0":
                    clean[label] = v
            if clean: result["expansion_slots"].append(clean)

        # Networking (from b3)
        if b3:
            net = b3[0].get("net")
            if isinstance(net, dict): result["networking"] = dict(net)

        # PSU
        result["psu"] = _clean(_val("ps"))

        # Cooling
        result["cooling"] = _clean(_val("cl"))

        # Management
        result["management"]["bmc"] = _val("bm", "name")

        # Security (b2 rows: key1=name)
        security = []
        seen_sec = set()
        for row in b2_security:
            v = row.get("key1")
            if v and v not in seen_sec:
                seen_sec.add(v)
                security.append(v)
        result["security"] = security

        # TPM
        result["tpm"] = _clean(_val("tp"))

        # BIOS
        result["bios"] = _clean(_val("bios"))

        # OS (b2 rows: key1=full_name)
        os_list = []
        seen_os = set()
        for row in b2_os:
            v = row.get("key1")
            if v and v not in seen_os:
                seen_os.add(v)
                os_list.append(v)
        result["os_support"] = os_list

        # Features (b2 rows: key1=description)
        features = []
        seen_feat = set()
        for row in b2_features:
            v = row.get("key1")
            if v and v not in seen_feat:
                seen_feat.add(v)
                features.append(v)
        result["features"] = features

        # Video (from b3)
        if b3:
            vid = b3[0].get("vid")
            if isinstance(vid, dict): result["video"] = dict(vid)

            fio = b3[0].get("fio")
            if isinstance(fio, dict): result["front_io"] = dict(fio)
            rio = b3[0].get("rio")
            if isinstance(rio, dict): result["rear_io"] = dict(rio)

            ic = b3[0].get("ic")
            if isinstance(ic, dict): result["interconnect"] = dict(ic)

            fw = b3[0].get("fw")
            if isinstance(fw, dict): result["firmware"] = dict(fw)

        # Physical (weight + dimensions)
        pw = _val("pw")
        if pw: result["physical"] = _clean(pw)

        return result

    # ============= TOOLS =============

    def tool_list_models() -> list:
        """List all 5 product models with basic info."""
        return _row("""
            MATCH (p:Product)
            OPTIONAL MATCH (p)-[:HAS_FORM_FACTOR]->(f:FormFactor)
            OPTIONAL MATCH (p)-[:SUPPORTS_PROCESSOR]->(cpu:Processor)
            OPTIONAL MATCH (p)-[:HAS_MEMORY]->(m:Memory)
            RETURN p.product AS model, p.form_factor AS form_factor,
                   f.name AS ff_detail, cpu.max_tdp AS max_tdp_w,
                   m.slots AS dimm_slots, m.type AS memory_type
        """)

    def tool_get_spec(model: str) -> dict:
        """Get full specification for a product model. Safe — uses canonical names only."""
        canonical = normalize_model(model)
        if canonical is None:
            return {"error": f"Unknown model '{model}'. Known models: 1240-RG, 2240, 2240-RG, 2240-RM, 2240-RE."}
        try:
            spec = _fetch_product_sections(canonical)
            if "_error" in spec:
                return {"error": spec["_error"]}
            return spec
        except Exception as e:
            return {"error": f"Failed to fetch specs for {canonical}: {e}"}

    def tool_find_by_requirement(
        form_factor: str = "",
        min_dimm: int = 0,
        sockets: int = 0,
        min_storage_bays: int = 0,
        use_case: str = "",
    ) -> dict:
        """Find products matching requirements. Use when user asks for '2U server',
        'at least 32 DIMM', 'dual socket', 'edge deployment', etc.

        All filters are AND-combined. Empty / zero arguments are ignored. `use_case`
        is a substring match against Application node name + description (e.g.
        'AI', 'database', 'edge', 'storage').
        """
        # Normalize: treat junk strings (LLM sometimes echoes "user_input") as empty.
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

        # Each filter contributes a MATCH and a WHERE clause. We accumulate clauses
        # separately so the query is well-formed regardless of which args were set.
        matches: list[str] = []
        wheres: list[str] = []

        if form_factor:
            matches.append("MATCH (p)-[:HAS_FORM_FACTOR]->(f:FormFactor)")
            wheres.append(f"f.name CONTAINS '{_safe_quote(form_factor)}'")
        if min_dimm > 0:
            matches.append("MATCH (p)-[:HAS_MEMORY]->(m:Memory)")
            wheres.append(f"m.slots >= {int(min_dimm)}")
        if sockets > 0:
            matches.append("MATCH (p)-[:SUPPORTS_PROCESSOR]->(cpu:Processor)")
            wheres.append(f"cpu.sockets >= {int(sockets)}")
        if min_storage_bays > 0:
            matches.append("MATCH (p)-[:HAS_STORAGE]->(s:Storage)")
            wheres.append(f"s.bays >= {int(min_storage_bays)}")
        if use_case:
            matches.append("MATCH (p)-[:TARGETS]->(a:Application)")
            q = _safe_quote(use_case)
            wheres.append(f"(a.name CONTAINS '{q}' OR a.description CONTAINS '{q}')")

        query = "MATCH (p:Product)"
        if matches:
            query += " " + " ".join(matches)
        if wheres:
            query += " WHERE " + " AND ".join(wheres)
        query += " RETURN DISTINCT p.product AS model ORDER BY p.product"

        rows = _row(query)
        if rows and rows[0].get("_error"):
            return {"error": rows[0]["_error"]}
        models = [row["model"] for row in rows]

        # Echo back which filters were applied so the LLM can summarize.
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
        for m in models:
            canonical = m[len("Vantageo "):] if m.startswith("Vantageo ") else m
            spec = tool_get_spec(canonical)
            if "error" in spec:
                summaries[m] = {"model": m, "error": spec["error"]}
            else:
                summaries[m] = {
                    "model": m,
                    "form_factor": spec.get("form_factor", ""),
                    "processor": spec.get("processor", {}).get("model", ""),
                    "memory_slots": spec.get("memory", {}).get("slots", ""),
                    "memory_type": spec.get("memory", {}).get("type", ""),
                    "storage_bays": spec.get("storage", {}).get("bays", ""),
                }
        return {
            "matched": len(models),
            "filters": applied,
            "models": summaries,
        }

    def tool_compare(products: list[str]) -> dict:
        """Compare multiple products."""
        return {p: tool_get_spec(p) for p in products}


# ============= TEST =============
if __name__ == "__main__":
    print("Backend:", "json" if _USE_JSON else "falkordb")
    print("Models:", [p["model"] for p in tool_list_models()])
    print("\n2240-RM spec (truncated):")
    s = tool_get_spec("2240-RM")
    print(json.dumps(s, indent=2, ensure_ascii=False)[:600])
    print("\nFind 2U:", list(tool_find_by_requirement(form_factor="2U").keys()))
