# Deploying to Render (free tier)

This guide walks you through deploying Vantageo to Render's free web service. The whole flow takes about 10 minutes.

## What you need

- A GitHub account (free) — Render pulls the code from a GitHub repo
- A Render account (free) — sign up at https://render.com
- An LLM API key — NVIDIA NIM (recommended) or OpenAI-compatible

## What Render's free tier gives you

- 750 hours/month of runtime
- Spins down after 15 min of inactivity (cold start ≈ 30-60 s)
- Custom domain support
- Auto-deploys on `git push` to your connected branch
- HTTPS by default

## Limitations to know about

- **No persistent disk.** The filesystem is wiped on every deploy. Your `config.json` writes are session-only — but the API key is read from env vars, so the app works fine.
- **No graph database.** Render's free tier doesn't include Redis or any graph DB. We bundle the product data in `json_formate/*.json` and the app auto-uses the JSON backend. The LLM tools (`list_products`, `get_product_spec`, `find_by_requirement`, `compare_products`) work identically.
- **Cold starts.** First request after a 15-min idle period takes 30-60 s. Subsequent requests are fast. Plan your demo accordingly.

## Step-by-step

### 1. Push the repo to GitHub

```bash
# From the project root
git init
git add .
git commit -m "Initial Vantageo deploy"
```

Create a new repo on https://github.com/new (private is fine — it has your `render.yaml` with deployment config). Then:

```bash
git remote add origin https://github.com/<your-username>/<your-repo>.git
git branch -M main
git push -u origin main
```

> The repo root contains a `.gitignore` that excludes `node_modules/`, `__pycache__/`, `frontend/dist/`, `data/`, `output/`, `config.json`, the legacy `lib/bindings|tom-select|vis-9.1.2/`, and the legacy `AGENT.md` / `CLAUDE.md`. The committed files are exactly what Render needs: `app.py`, `lib/`, `frontend/src/`, `frontend/package.json`, `json_formate/`, `scripts/`, `render.yaml`, `requirements.txt`.

### 2. Create the Render service

In the Render dashboard:

1. Click **New +** → **Blueprint**.
2. Connect your GitHub account if you haven't already.
3. Select the repo you just pushed.
4. Render will detect `render.yaml` and show the `vantageo` service. Click **Apply**.
5. Render will start the first build. It will:
   - Install Python deps
   - Install Node deps
   - Build the React frontend (`npm run build` → `frontend/dist/`)
   - Start uvicorn

This first build takes 2-4 minutes.

### 3. Set the API key secret

In the Render dashboard for your new service:

1. Go to **Environment** in the left sidebar.
2. Under **Secret Files / Environment Variables**, add:
   - **Key:** `NVIDIA_API_KEY`
   - **Value:** your NVIDIA NIM key (starts with `nvapi-...`)
3. Click **Save Changes**. Render will redeploy automatically.

If you want to use a different provider, also set:

- `VANTAGEO_LLM_PROVIDER=commandcode` (or leave as `nvidia`)
- `VANTAGEO_LLM_MODEL=<model-name>` if the default isn't right
- `OPENAI_API_KEY=...` (or `CC_LLM_API_KEY`) instead of `NVIDIA_API_KEY`

### 4. Wait for the deploy to finish

Watch the **Logs** tab. You should see:

```
INFO  Starting Vantageo chatbot — config=... port=10000
INFO  Using JSON backend (no FalkorDB connection)
INFO  JSON backend loaded 5 products from ...
INFO  Application startup complete.
Uvicorn running on http://0.0.0.0:10000
```

When the deploy is green, Render shows a URL like `https://vantageo-xxxx.onrender.com`. Open it — you should see the Vantageo chat UI with the home screen.

### 5. Verify it works

Visit `https://vantageo-xxxx.onrender.com/api/health` — you should see:

```json
{
  "status": "healthy",
  "checks": {
    "data_backend": "ok",
    "data_backend_type": "json",
    "llm": "ok",
    "llm_provider": "nvidia",
    "llm_model": "meta/llama-3.3-70b-instruct"
  }
}
```

Then in the UI:
1. Click any **Suggested prompt** chip → you should get a streamed LLM response that calls `list_products` and lists all 5 Vantageo servers.
2. Click **Get Quote** on a product card → form opens → fill it in → submit → receipt appears.
3. Open the **Compare Models** tab → add 2+ products → comparison table renders.

### 6. (Optional) Custom domain

In Render: **Settings** → **Custom Domains** → add your domain. Render auto-provisions a Let's Encrypt cert.

---

## Local dev vs deployed

The same code runs locally and on Render — the only difference is which data backend is active.

| | Local dev | Render |
|---|---|---|
| **Data backend** | FalkorDB (auto) or JSON | JSON (auto, since no FalkorDB) |
| **LLM key** | `D:\firm\config.json` or env vars | `NVIDIA_API_KEY` env var (secret) |
| **Frontend** | `cd frontend && npm run dev` (Vite, port 5173) | Served by FastAPI from `frontend/dist/` |
| **Backend** | `python app.py` (port 8000) | uvicorn on Render's `$PORT` |
| **CORS** | `*` | `*` (same origin) |
| **Filesystem** | Persistent | Ephemeral (config writes are session-only) |

To run locally with the JSON backend (no FalkorDB required):

```bash
VANTAGEO_DATA_BACKEND=json python app.py
```

To run locally with the default (FalkorDB) backend:

```bash
# In one terminal — start FalkorDB on localhost:6380
# In another terminal:
python scripts/build_graph.py   # only needed once
python app.py
```

## If something goes wrong

- **"Application failed to respond"** — check the Logs tab. Most often a missing env var. The `/api/health` endpoint reports which dependency is unhappy.
- **LLM errors** — the chat UI surfaces the error inline. Common cause: invalid `NVIDIA_API_KEY` or unsupported model name. Try `meta/llama-3.3-70b-instruct` or check NVIDIA NIM's available models.
- **Cold start timeout** — Render free tier sleeps after 15 min. The first request after wakeup can take 30-60 s. If your demo lands on a sleeping service, hit `/api/health` first to wake it up before opening the chat.
- **Build fails on `npm install`** — check that `frontend/package-lock.json` is committed. If it's missing, run `npm install` locally, commit the lockfile, and push.
- **Build fails on `pip install`** — check `requirements.txt` is committed.

## Upgrading later

Render's free tier is enough for a demo but limited for production. When you're ready:

- **$7/mo Starter** — no spin-down, always-on. Just change `plan: free` to `plan: starter` in `render.yaml`.
- **Postgres for pricing** — add a Render Postgres instance, set `DATABASE_URL`, and migrate `lib/pricing.py` to read from it (per the AGENTS.md migration note). The pricing engine's interface (`calculate_quote(...)`) is unchanged.
- **FalkorDB on Render** — Render doesn't have a managed FalkorDB. You'd need to deploy FalkorDB on a VM (e.g. Render's Docker service, or a small VPS), then set `VANTAGEO_DATA_BACKEND=falkordb` and `FALKORDB_HOST=<host>`.
