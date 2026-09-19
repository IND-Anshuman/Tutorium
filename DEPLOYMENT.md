# Tutorium — Deployment Runbook (Google Cloud Run)

## Architecture reality (read before demo day)

- **Data is ephemeral.** SQLite lives in the container's `/data` (set via `TUTORIUM_DATA_DIR`).
  Every deploy or instance recycle wipes users, sessions, materials. Accepted for the demo;
  swap to Cloud SQL Postgres + `src/lib/db.ts` driver change for durability.
- **`--max-instances=1` is REQUIRED for correct behavior.** The job runner and the
  in-memory rate-limit buckets are per-process. One instance = correct; two = duplicated
  study packs + split rate limits. Raise to >1 only after adding job leases + external
  rate-limit store.
- **Identity = Clerk.** Every API request is authenticated by middleware; the server derives
  the userId (`clerk:<id>`), never the client. When `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`/`CLERK_SECRET_KEY`
  are absent (local dev), the app falls back to `demo-user` — this fallback is IMPOSSIBLE on a
  deployed service with keys configured.
- **Spend guards:** in-memory token buckets (agent 20/10min, STT 6/10min, ingest 3/hour, **OCR 4/hour** per user)
  + persisted daily LLM-call counter (`spend_guard` table, `TUTORIUM_DAILY_LLM_BUDGET`, default 300/day/user).
  OCR calls also count toward the daily budget (VLM inference is the most expensive single call in the system).
  Budget check fails OPEN if the counter table is unavailable (limits never take the app down).
- **OCR (scanned PDF fallback):** `/api/ingest` tries `unpdf` text extraction first (free path).
  If the PDF has no embedded text, it rasterizes pages via `unpdf.renderPageAsImage` + `@napi-rs/canvas`
  (native, Rust-backed — fast, no system deps) and POSTs the images to a Vision-Language Model
  (`Qwen/Qwen3-VL-30B-A3B-Instruct` via your existing Featherless account). Same Bearer auth, same
  `/v1/chat/completions` endpoint, just a different model id. Cap: **3 pages per request** (longer scans
  413 with a friendly split-this-message). Without `TUTORIUM_OCR_API_KEY`/`TUTORIUM_OCR_MODEL`,
  scanned PDFs 422 with a one-liner telling the user how to enable it.
  **Cannot be smoke-tested from the developer's local machine** — Cloudflare blocks the local egress IP
  to Cloudflare-fronted providers (Clerk, Featherless). Works from Cloud Run (different egress IP).

## Environment variables (runtime)

| Var | Purpose | Set via |
|---|---|---|
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk front-end | `--set-env-vars` (public, not secret) |
| `CLERK_SECRET_KEY` | Clerk backend | Secret Manager |
| `FEATHERLESS_API_KEY` | LLM provider | Secret Manager |
| `SPEECHMATICS_API_KEY` | STT provider | Secret Manager |
| `TUTORIUM_OCR_API_KEY` | OCR (VLM) provider — defaults to `TUTORIUM_LLM_API_KEY` | optional, env var is fine |
| `TUTORIUM_OCR_MODEL` | OCR VLM model id | optional, default `Qwen/Qwen3-VL-30B-A3B-Instruct` |
| `TUTORIUM_DATA_DIR` | SQLite dir | Dockerfile (default `/data`) |
| `TUTORIUM_LLM_PRIMARY_TIMEOUT_MS` | Provider failover speed | optional, default 22s |
| `TUTORIUM_DAILY_LLM_BUDGET` | Daily per-user LLM calls | optional, default 300 |

## Deploy via Cloud Run console (GUI, no gcloud)

1. **Secrets:** console.cloud.google.com → Secret Manager → *Create secret* ×3 —
   `featherless-api-key`, `speechmatics-api-key`, `clerk-secret-key` (paste values). Region `asia-south1`.
   **Clerk keys must be PRODUCTION keys** (`pk_live_`/`sk_live_` — create a production instance at
   dashboard.clerk.com; dev instances have strict usage limits and `pk_test_` shows a console warning).
2. **Cloud Run → Create service →** "Continuously deploy new revisions from a source repository" →
   connect GitHub → `IND-Anshuman/Tutorium`, branch `main`, build type **Dockerfile** (repo root).
3. **Service settings:**
   - Service name `tutorium`, region `asia-south1`, ingress "All traffic", auth "Allow unauthenticated" (Clerk guards the app).
   - **Container tab → port `8080`**; CPU 1, Memory **1 Gi**.
   - **Capacity:** min instances 0, **max instances 1** (REQUIRED — jobrunner + rate limits are per-process), concurrency **40**, request timeout **300 s**.
4. **Variables & secrets tab:** env var `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=<pk_...>`, `TUTORIUM_DATA_DIR=/data`;
   expose secrets: `CLERK_SECRET_KEY` ← `clerk-secret-key`, `FEATHERLESS_API_KEY` ← `featherless-api-key`, `SPEECHMATICS_API_KEY` ← `speechmatics-api-key` (all `latest`).
5. **Create →** first build takes ~10–15 min (Cloud Build + Artifact Registry enable themselves on first use).
   Then hit `<URL>/api/health` → expect `ok:true, auth:"clerk", llmKey:true, stt:"speechmatics"`.

## Deploy (copy-paste, in order)

```bash
# 0. one-time setup
gcloud auth login
gcloud config set project <PROJECT_ID>
gcloud services enable run.googleapis.com cloudbuild.googleapis.com secretmanager.googleapis.com

# 1. secrets (repeat per key; paste value then press Enter+Ctrl+Z / Ctrl+D)
gcloud secrets create featherless-api-key --data-file=-
gcloud secrets create speechmatics-api-key --data-file=-
gcloud secrets create clerk-secret-key --data-file=-

# 2. let Cloud Run's runtime service account read them
PROJECT_NUMBER=$(gcloud projects describe <PROJECT_ID> --format='value(projectNumber)')
for S in featherless-api-key speechmatics-api-key clerk-secret-key; do
  gcloud secrets add-iam-policy-binding $S \
    --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
    --role="roles/secretmanager.secretAccessor"
done

# 3. build + deploy from source (uses the repo Dockerfile via Cloud Build)
gcloud run deploy tutorium \
  --source . \
  --region asia-south1 \
  --allow-unauthenticated \
  --max-instances=1 \
  --timeout=300 \
  --concurrency=40 \
  --memory=1Gi \
  --cpu=1 \
  --set-env-vars "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=<pk_...>,TUTORIUM_DATA_DIR=/data" \
  --set-secrets "CLERK_SECRET_KEY=clerk-secret-key:latest,FEATHERLESS_API_KEY=featherless-api-key:latest,SPEECHMATICS_API_KEY=speechmatics-api-key:latest"
```

## Post-deploy verification (the smoke)

```bash
URL=<your-cloud-run-url>

# 1. health: all keys present, dynamic (not build-time) booleans
curl -s $URL/api/health | jq
# expect: ok:true, llmKey:true, stt:"speechmatics", auth:"clerk", ocrKey:true, ocr:"Qwen/Qwen3-VL-30B-A3B-Instruct"

# 2. unauth gate: pages redirect to /sign-in, APIs 401
curl -s $URL/ -o /dev/null -w '%{http_code}\n'   # 307
curl -s -X POST $URL/api/agent -H 'Content-Type: application/json' \
  -d '{"message":"hi"}' -w '%{http_code}\n'      # 401

# 3. ingest: text PDF
curl -s -X POST $URL/api/ingest -F file=@notes.pdf \
  -b "<clerk-session-cookie>" | jq '.source, .chars'
# expect: "text", >0

# 4. ingest: scanned PDF (the new path)
curl -s -X POST $URL/api/ingest -F file=@scanned-notes.pdf \
  -b "<clerk-session-cookie>" | jq '.source, .chars, .ocrModel'
# expect: "ocr", >0, "Qwen/Qwen3-VL-30B-A3B-Instruct"
#   >3 pages  → 413 with "split the document"
#   no OCR key → 422 with "OCR isn't configured"
```

Sign in through the browser (Clerk modal), then walk: teach → study pack → quiz → say-it-back → PDF → review queue → upload a scanned note PDF.

## Cost (per typical demo)

| Path | Cost |
|---|---|
| Chat turn (primary model, ~500 tok in/300 out) | ~$0.0005 |
| Chat turn (fallback model) | ~$0.0005 |
| STT 60s of speech | ~$0.005 |
| OCR scan, 1 page (Qwen3-VL, 1 image) | ~$0.001–0.005 |
| OCR scan, 3 pages (cap) | ~$0.003–0.015 |

A 10-turn demo session with 1 scanned PDF = roughly **$0.02–0.05** of provider spend, well inside any free tier.

## Ops

- **Auth fails CLOSED in production.** If a container starts without `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`/`CLERK_SECRET_KEY`,
  APIs return 401 with "Auth not configured" and pages 503 — `/api/health` stays reachable and will report `auth:"demo-fallback"`.
  If you see that on a deployed URL, the `--set-env-vars`/`--set-secrets` didn't land: fix and redeploy (data is ephemeral, so a redeploy is free).
- **Local smoke note:** Docker Desktop port 8080 is often taken — the verified local smoke used `-p 18080:8080`.

- **Rollback:** `gcloud run revisions list --service tutorium` →
  `gcloud run services update-traffic tutorium --to-revisions <PREVIOUS>=100 --region asia-south1`
- **Logs:** `gcloud run services logs read tutorium --region asia-south1 --limit 100`
- **Kill switch:** lower `TUTORIUM_DAILY_LLM_BUDGET` to 0 via a redeploy with changed env, or set Cloud Run `--no-traffic`.
- **Cost guardrails on GCP side:** Billing budget alert ($5), `--max-instances=1` (hard cap on compute),
  per-user spend guard (hard cap on provider spend).

## Known-unfixed demo gaps (honesty ledger)

- Session rename second time silently no-ops (audit F13).
- Topic-page Say-It-Back card has no record button (F01 partial).
- Say-it-back drill scores are local-only — lost on reload (F08).
- Browser mic flows were never E2E-verified in automation; test manually on the deployed URL before presenting.
