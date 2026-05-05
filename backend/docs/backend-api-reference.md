# Backend API Reference

## Conventions

- base path: `/api`
- auth mode: cookie session unless noted otherwise
- non-2xx responses use:

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human readable message",
    "details": {}
  }
}
```

## Health

### `GET /api/health`

Checks PostgreSQL and Redis connectivity.

Auth: none

## Auth

### `POST /api/auth/register`

Creates a user and sets a session cookie.

### `POST /api/auth/login`

Logs in an existing active user and sets a session cookie.

### `POST /api/auth/logout`

Revokes the current session cookie.

### `GET /api/auth/me`

Returns the current authenticated user.

Auth: required

## Assets

### `POST /api/assets`

Uploads one reference image as raw binary.

Auth: required

Headers:

- `Content-Type: image/*`
- optional `X-Original-Filename`

### `GET /api/assets`

Lists the caller's assets.

Auth: required

Query:

- `kind` optional

### `GET /api/assets/:assetId`

Returns asset metadata.

Auth: required

### `GET /api/assets/:assetId/content`

Streams the asset binary.

Auth: required

## Generations

### `POST /api/generations`

Creates a generation job.

Auth: required

Accepted request styles:

1. internal normalized generation request
2. managed official-style NovelAI request
3. multipart request with a JSON `request` field plus image file fields

Important behavior:

- user balance must be positive before queueing
- parameters are checked against active policies
- unknown official-style payloads are rejected with `UNSUPPORTED_NOVELAI_REQUEST`
- on success returns `{ "jobId": "..." }`

### `GET /api/generations`

Lists up to 50 jobs owned by the caller.

Auth: required

### `GET /api/generations/:jobId`

Returns one owned job with outputs.

Auth: required

### `GET /api/generations/:jobId/events`

SSE stream for generation progress.

Auth: required

Event types:

- `queued`
- `policy_applied`
- `waiting_for_result_consumer`
- `running`
- `provider_progress`
- `intermediate_output_ready`
- `output_ready`
- `billing_recorded`
- terminal: `succeeded`, `failed`, `cancelled`

### `GET /api/generations/:jobId/results/:index`

Streams one generated image binary.

Auth: required

## Admin history

### `GET /api/history`

Returns the latest 100 generation records across users.

Auth: admin

### `GET /api/history/:jobId`

Returns one admin-visible generation record.

Auth: admin

## Admin overview

### `GET /api/admin/overview`

Returns high-level backend state for the admin console.

Auth: admin

Includes:

- NovelAI readiness blockers
- account pool counts
- generation counts by status
- policy totals
- current platform settings
- recent jobs

## Admin settings

### `GET /api/admin/settings`

Returns current platform settings.

Auth: admin

### `PATCH /api/admin/settings`

Updates platform settings.

Auth: admin

Currently supported:

- `anlasMultiplier`

## Admin policies

### `GET /api/admin/policies`

Lists all parameter policies.

Auth: admin

### `POST /api/admin/policies`

Creates a policy.

Auth: admin

### `PATCH /api/admin/policies/:policyId`

Updates a policy and increments its version.

Auth: admin

### `POST /api/admin/policies/:policyId/disable`

Disables a policy and increments its version.

Auth: admin

### `POST /api/admin/policies/preview`

Runs policy evaluation against a request payload without creating a job.

Auth: admin

## Admin ledger

### `POST /api/admin/users/:userId/ledger/grant`

Adds platform units to a user's balance and writes a ledger entry.

Auth: admin

## Admin NovelAI account pool

### `GET /api/admin/novelai/accounts`

Lists all configured NovelAI accounts plus runtime readiness info.

Auth: admin

### `POST /api/admin/novelai/accounts`

Creates a NovelAI account record with encrypted credentials.

Auth: admin

### `PATCH /api/admin/novelai/accounts/:accountId`

Updates account metadata such as status, priority, concurrency, or cooldown.

Auth: admin

### `POST /api/admin/novelai/accounts/:accountId/rotate-credential`

Replaces the stored credential.

Auth: admin

### `POST /api/admin/novelai/accounts/:accountId/enable`

Marks an account active.

Auth: admin

### `POST /api/admin/novelai/accounts/:accountId/disable`

Marks an account disabled.

Auth: admin

### `POST /api/admin/novelai/accounts/:accountId/test`

Runs one of the supported account checks.

Auth: admin

Modes:

- `health_check`
- `smoke_test`

## Managed NovelAI helper route

### `GET /api/novelai/suggest-tags`

Returns upstream NovelAI suggest-tag results. The backend tries the upstream endpoint anonymously first and falls back to a managed account lease only if upstream rejects anonymous access.

Auth: none

Query:

- `model`
- `prompt`

## Supported official-style generation modes

The backend accepts official-style payloads only through `POST /api/generations`.

Currently supported shapes:

- `action=generate`
- `action=img2img` with variations markers
- `action=img2img` with enhance markers
- `action=img2img` with `upscale_factor=4`

Unknown or mixed img2img marker sets are rejected.

## Important omissions

These are not implemented as inbound public routes today:

- direct upstream path mirroring such as `/ai/generate-image-stream`
- a public generation cancel route
- non-image NovelAI product surfaces
