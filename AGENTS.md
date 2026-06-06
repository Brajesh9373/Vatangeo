# AGENTS.md

Operating notes for working in this repository. The legacy vision document lives at `AGENT.md` (singular) / `CLAUDE.md` — do not treat it as agent guidance.

## Repository Layout

- `app.py` — FastAPI backend entrypoint. Port 8000, `reload=True`.
- `lib/graph_queries.py` — All FalkorDB tool functions exposed to the LLM (`tool_list_models`, `tool_get_spec`, `tool_find_by_requirement`, `tool_compare`).
- `frontend/` — React 19 + Vite 6 + TypeScript + Tailwind v4 + framer-motion. Dev port 5173, build output `frontend/dist/` served by `app.py` in production.
- `scripts/` — Data pipeline: `normalize_json.py` (in-place schema rewrite), `build_graph.py` (loads `json_formate/*.json` into FalkorDB), `visualize_graph.py` (writes `output/vantageo_graph.html`).
- `json_formate/` — 5 normalized product JSONs (`1240_RG.json`, `2240.json`, `2240_RG.json`, `2240-RM.json`, `2240_re.json`). Edited in place by `normalize_json.py` — back up before running.
- `data/` — Source PDF datasheets (not loaded at runtime).
- `output/` — Generated artifacts (visualization HTML, key dumps, normalization map).
- `lib/bindings/`, `lib/tom-select/`, `lib/vis-9.1.2/` — Vendored JS libraries, not imported by `app.py` (legacy from an older UI).

## Service Prerequisites

- **FalkorDB** must be running at `localhost:6380` (not 6379 — that is default Redis). Hardcoded in `lib/graph_queries.py:9`.
- **Python deps** are not pinned — there is no `requirements.txt` or `pyproject.toml`. Install manually: `fastapi`, `uvicorn`, `pydantic`, `httpx`, `falkordb`.
- **`config.json` lives at `D:\firm\config.json`** (parent of the repo), not inside the repo. `app.py:23` reads `BASE_DIR.parent / "config.json"`. Schema: `{ "provider": "nvidia" | "commandcode", "model": "...", "api_key": "..." }`. The repo tracks no template — copy an existing file in or `app.py:106` will fall back to defaults.

## Run Commands

Backend (root, requires FalkorDB + config.json):
```
python app.py
# or: uvicorn app:APP --reload --host 0.0.0.0 --port 8000
```

Frontend (separate terminal):
```
cd frontend
npm install
npm run dev      # vite dev server, /api proxied to http://localhost:8000
npm run build    # tsc -b && vite build → frontend/dist/
npm run preview  # serve built dist locally
```

Data pipeline (run in order):
```
python scripts/normalize_json.py   # rewrites json_formate/*.json in place
python scripts/build_graph.py      # drops + rebuilds the "vantageo" graph
python scripts/visualize_graph.py  # writes output/vantageo_graph.html
```

## LLM Provider Config

- Two providers wired in `app.py:37`: `nvidia` (default endpoint: NVIDIA NIM, default model `deepseek-ai/deepseek-v4-pro`) and `commandcode` (default OpenAI-compatible, model `gpt-4o-mini`).
- API key resolution order: `config.json` `api_key` → env var `NVIDIA_API_KEY` / `OPENAI_API_KEY` → env var `CC_LLM_API_KEY` (commandcode only).
- Endpoint override: env `CC_LLM_ENDPOINT` or `config.json` `endpoint`.
- `GET /api/config` masks the API key; `POST /api/config` writes back to disk.

## Repository Quirks

- **No test framework.** `lib/graph_queries.py` has a `__main__` smoke test (`python lib/graph_queries.py`); no pytest, no Vitest.
- **No lint or formatter config** (no eslint, prettier, ruff, black). The frontend build runs `tsc -b` so type errors break the build.
- **`scripts/normalize_json.py` overwrites `json_formate/*.json` in place** with no backup. Originals are also under `data/` (as PDFs) and `New folder/` (as `.md`), but not as raw JSON.
- **`scripts/build_graph.py:14` deletes the entire graph** before re-populating. No incremental sync.
- **Cypher injection mitigation** in `lib/graph_queries.py`: user-supplied model names are normalized to canonical names via `MODEL_MAP` (line 12) and `_safe_quote` escapes the result. Don't bypass this — the LLM is the source of all model-name strings.
- **Frontend state**: `ChatContext`, `ConfigContext`, `ThemeContext` in `frontend/src/context/`. `ConfigContext` reads `localStorage` on init and re-hydrates from `GET /api/config` on mount.
- **Color tokens** are defined as Tailwind v4 `@theme` custom properties in `frontend/src/index.css` — use them via `var(--color-*)` or `bg-[var(--color-*)]`. There is no `tailwind.config.js`.
- **Existing dist** is committed at `frontend/dist/`. `app.py:281` mounts it when present, so a stale build is served until you rebuild.

## Domain Constraints (from project vision)

- The LLM only **extracts requirements and formats responses**. It must never calculate prices or make compatibility decisions — those go through `lib/graph_queries.py` against FalkorDB, and pricing (when added) must read from PostgreSQL only.
- The four tool functions in `lib/graph_queries.py` are the entire surface the LLM can call. New product data must be added by extending `json_formate/*.json` and re-running `build_graph.py`, not by giving the LLM direct access.
- Known canonical model names: `1240-RG`, `2240`, `2240-RG`, `2240-RM`, `2240-RE` (and `4440` in `MODEL_MAP` but not yet in `json_formate/`).
</content>
</invoke>