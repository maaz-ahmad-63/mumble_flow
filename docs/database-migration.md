# Supabase PostgreSQL Database Migration Guide

This guide covers migrating Mumble AI from local SQLite (`data/mumble_flow.sqlite`) to managed **Supabase PostgreSQL**.

---

## 1. Overview & Dual-Engine Architecture

Mumble AI supports a dynamic dual-database architecture:
- **Local / Self-Hosted / Development (Default):** When `DATABASE_URL` is omitted, Mumble AI automatically uses local SQLite at `data/mumble_flow.sqlite`.
- **Cloud / Render Production:** When `DATABASE_URL` is provided, Mumble AI automatically connects to PostgreSQL with:
  - Connection pooling via `pg.Pool` (configurable via `DB_POOL_MAX`, default: 10)
  - SSL encryption (`ssl: { rejectUnauthorized: false }` for Supabase poolers)
  - Automatic ANSI SQL placeholder translation (`?` &rarr; `$1, $2, ...`)
  - Case-insensitive camelCase identifier proxies
  - Versioned schema migrations (1–4) executed on startup

> [!NOTE]
> The original SQLite database at `data/mumble_flow.sqlite` is **never deleted or modified** during or after migration. If `DATABASE_URL` is removed, Mumble AI seamlessly falls back to SQLite.

---

## 2. Prerequisites

1. A **Supabase** account and project (free or pro): [https://supabase.com](https://supabase.com)
2. Obtain your **Supabase Connection Pooler URI**:
   - Go to your Supabase project &rarr; **Project Settings** &rarr; **Database** &rarr; **Connection String** &rarr; **Session / Transaction Pooler**.
   - **Session Pooler (Recommended for Express persistent connections, port 5432):**
     ```text
     postgres://postgres.[PROJECT-REF]:[YOUR-PASSWORD]@aws-0-[REGION].pooler.supabase.com:5432/postgres
     ```
   - **Transaction Pooler (Port 6543):**
     ```text
     postgres://postgres.[PROJECT-REF]:[YOUR-PASSWORD]@aws-0-[REGION].pooler.supabase.com:6543/postgres
     ```
   > [!IMPORTANT]
   > Cloud hosting providers like Render do not have IPv6 outbound routing. Do not connect via the direct `db.[PROJECT-REF].supabase.co:5432` host as it resolves only to IPv6 (`ENETUNREACH`). The Pooler hostnames (`*.pooler.supabase.com`) resolve to IPv4 addresses.

---

## 3. Pre-Migration Verification (Dry Run)

Before transferring data, you can run a non-destructive dry run to verify connectivity and row counts:

```bash
DATABASE_URL="postgres://postgres.[REF]:[PASS]@[HOST]:6543/postgres" npm run migrate:pg -- --dry-run
```

This will:
1. Verify the local `data/mumble_flow.sqlite` database file.
2. Connect to Supabase PostgreSQL using SSL.
3. Apply pending PostgreSQL schema migrations (1–4) if necessary.
4. Output the table reconciliation plan without writing any records.

---

## 4. Executing the Data Migration

Run the repeatable data migration script:

```bash
DATABASE_URL="postgres://postgres.[REF]:[PASS]@[HOST]:6543/postgres" npm run migrate:pg
```

Or pass the URL directly via CLI:

```bash
npm run migrate:pg -- --url "postgres://postgres.[REF]:[PASS]@[HOST]:6543/postgres"
```

### What Happens During Migration
The migration script executes in strict **topological order** respecting all foreign keys and cascades:
1. `users` (IDs, emails, scrypt password hashes, roles, statuses)
2. `workspaces` & `workspace_members` (workspaces and role memberships)
3. `sessions` (valid session tokens and expiration timestamps)
4. `settings` (per-user preferences and model selections)
5. `user_quotas` (monthly audio minutes, LLM requests, budget limits)
6. `user_api_keys` (AES-256-GCM encrypted BYOK keys, hints, validation status)
7. `dictionary` (custom phonetic terms and spellings)
8. `snippets` (voice triggers and expansion content)
9. `history` (audio transcripts, durations, latencies, metadata)
10. `meetings` (summaries, action items, transcripts)
11. `usage_events` (usage telemetry, token counts, cost control)

### Idempotency & Safe Re-Runs
Re-running the migration is safe and will **not** overwrite newer PostgreSQL data with stale SQLite data:
- Mutable tables (`users`, `settings`, `user_quotas`, `user_api_keys`, `dictionary`, `snippets`) apply `ON CONFLICT (...) DO UPDATE ... WHERE EXCLUDED.updated_at > table.updated_at`. If a record in PostgreSQL has been updated more recently than the SQLite record, the update is ignored.
- Append-only and immutable tables (`workspaces`, `workspace_members`, `sessions`, `history`, `meetings`, `usage_events`) apply `ON CONFLICT (id) DO NOTHING`.

---

## 5. Post-Migration Verification

Verify data consistency and row counts between SQLite and PostgreSQL:

```bash
DATABASE_URL="postgres://postgres.[REF]:[PASS]@[HOST]:6543/postgres" npm run migrate:pg -- --verify
```

Expected output:
```text
--------------------------------------------------------------------------------
TABLE NAME           | SQLITE ROWS | POSTGRES ROWS | STATUS
--------------------------------------------------------------------------------
users                |           4 |             4 | ✓ SYNCHRONIZED
workspaces           |           4 |             4 | ✓ SYNCHRONIZED
workspace_members    |           4 |             4 | ✓ SYNCHRONIZED
sessions             |           2 |             2 | ✓ SYNCHRONIZED
settings             |           3 |             3 | ✓ SYNCHRONIZED
user_quotas          |           3 |             3 | ✓ SYNCHRONIZED
user_api_keys        |           2 |             2 | ✓ SYNCHRONIZED
dictionary           |           8 |             8 | ✓ SYNCHRONIZED
snippets             |           4 |             4 | ✓ SYNCHRONIZED
history              |          12 |            12 | ✓ SYNCHRONIZED
meetings             |           1 |             1 | ✓ SYNCHRONIZED
usage_events         |          15 |            15 | ✓ SYNCHRONIZED
--------------------------------------------------------------------------------
```

---

## 6. Switching Production on Render

Once data migration and verification are complete:

1. Open your Render Dashboard at [https://dashboard.render.com](https://dashboard.render.com).
2. Select your `whisperflow` / `mumble-flow` web service.
3. Navigate to **Environment**.
4. Add or update the variable:
   - **Key:** `DATABASE_URL`
   - **Value:** `postgres://postgres.[PROJECT-REF]:[YOUR-PASSWORD]@aws-0-[REGION].pooler.supabase.com:6543/postgres`
5. Configure TLS certificate verification & connection pool size (optional):
   - `DB_POOL_MAX`: Maximum connections in the pool (default: `10`).
   - `DATABASE_SSL_CA`: Path to a Root CA certificate file or raw PEM certificate content. When set, `rejectUnauthorized` defaults to `true`.
   - `DATABASE_SSL_REJECT_UNAUTHORIZED`: Set to `'true'` to enforce strict certificate trust verification, or `'false'` for Supabase transaction pooler SNI endpoints.
6. Click **Save Changes**.
7. Render will trigger a zero-downtime redeploy. Mumble AI will detect `DATABASE_URL` and route all production traffic to Supabase PostgreSQL.

---

## 7. Rollback Plan & Important Limitations

If you need to roll back to SQLite:
1. Open Render Dashboard &rarr; **Environment**.
2. Delete or clear the `DATABASE_URL` variable.
3. Save changes.
4. Render redeploys and Mumble AI immediately falls back to `data/mumble_flow.sqlite`.

> [!WARNING]
> **Data Synchronization Limitation on Rollback:**
> PostgreSQL changes are **NOT automatically synchronized back to SQLite**.
> Any new users registered, audio dictations recorded, settings altered, or BYOK API keys added while `DATABASE_URL` was active exist only in Supabase PostgreSQL.
> Rolling back to SQLite restores the exact database state as it existed at `data/mumble_flow.sqlite` before the migration. If you need to preserve data created while running on PostgreSQL, you must manually export it from PostgreSQL before removing `DATABASE_URL`.
