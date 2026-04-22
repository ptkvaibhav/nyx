# Nyx Project Plan

## Goal

Build a local agent that watches user-approved directories, identifies each file by stable content fingerprints, decides which connected cloud provider is appropriate, and uploads the file while preserving or inferring folder structure.

## Product Constraints

### 1. Do not identify files by name

Names move. Names change. A usable system needs a content-first identity model:

- Local primary fingerprint: SHA-256
- Compatibility fingerprints: MD5 for Google Drive binary files, SHA-1 for Git blob compatibility, file size, MIME type, modified time
- Provider object identity: provider item ID plus provider-native hash when available

### 2. Do not treat all cloud providers as interchangeable

- Google Drive and OneDrive are general-purpose document and media targets.
- GitHub is a source-control target, not a generic personal file vault.
- GitHub should be used for code assets and repository workflows, not arbitrary PDFs, videos, or large personal binaries.

### 3. Do not touch active repositories without explicit policy

If a code file is inside an existing Git repository, Nyx should leave the folder alone and record why it skipped it. If a code folder is not a repository, Nyx can suggest repository creation and ask for confirmation.

### 4. Do not scan the entire machine by default

Nyx should only monitor explicit allowlisted directories from the user. System directories, app caches, secrets, and temporary folders need exclusion rules.

### 5. Pricing data is volatile

Storage-plan suggestions should come from a refreshable pricing catalog with a recorded verification date. The advisor should never present hardcoded plan prices without an "as of" timestamp.

## Recommended MVP Scope

Start with:

1. Explicit watched directories.
2. Google Drive and OneDrive as storage providers.
3. GitHub only for code policy decisions and repo suggestions.
4. Local content fingerprinting and cataloging.
5. A planner that picks the best eligible provider based on:
   - category fit
   - free space
   - file size limits
   - provider health
   - duplicate detection status

Do not start with:

- cross-provider cloud-to-cloud migrations
- multi-device sync conflict resolution
- organization-wide enterprise admin features
- AI-generated deletion without user review

## Architecture

### Core Components

1. Config Manager
   - Loads watched directories, provider settings, routing policy, exclusions, and advisory thresholds.

2. Local Scanner
   - Initial crawl of watched roots.
   - Normalizes file paths, ignores excluded content, and produces scan events.

3. Watcher
   - Real-time file create and modify detection.
   - Debounces rapid writes so partially written files are not uploaded.

4. Fingerprint Service
   - Computes SHA-256, MD5, SHA-1, file size, extension, and MIME guess.
   - Produces a stable local file profile.

5. Classifier
   - Determines file category: document, image, video, archive, code, data, other.
   - Generates suggested folder segments such as `Resumes`, `Projects`, `Photos`, or `Archives`.

6. Repository Detector
   - Detects whether a file or directory lives inside a Git repository.
   - Applies a strict skip policy for existing repositories.

7. Provider Catalog
   - Stores connected accounts, free space, provider capabilities, limits, and current health.

8. Cloud Index
   - Tracks what Nyx has already uploaded and what provider IDs map to which local fingerprints.
   - Prevents repeated "does this already exist" scans for the same file.

9. Planner
   - Filters providers by relevance and eligibility.
   - Checks duplicate evidence.
   - Selects the highest-scoring provider.
   - Produces an execution plan or a user prompt.

10. Executor
    - Creates remote folders.
    - Uploads the file.
    - Writes provider IDs and hashes back to the catalog.

11. Advisory Engine
    - Detects quota pressure.
    - Suggests stale or redundant files for review.
    - Compares usage trend to current plan capacity and pricing catalog.

## Provider Strategy

### Google Drive

Use for documents, PDFs, images, videos, and general archives.

Strengths:

- Good fit for documents and general storage.
- Exposes `storageQuota`.
- Supports `md5Checksum` on binary files.
- Supports app-specific metadata through `appProperties`.

Implementation note:

- Nyx should store its own content fingerprint in `appProperties` where possible so later duplicate checks are cheap.

### OneDrive

Use for documents, images, videos, and general personal file backup.

Strengths:

- Exposes drive quota through the drive resource.
- Exposes file hashes via the `file.hashes` facet.
- Supports efficient change tracking through `delta`.

Implementation note:

- OneDrive reliably exposes `quickXorHash`; do not design around `sha256Hash`, which is not supported there.
- Nyx should keep a stronger local fingerprint and map it to OneDrive item IDs in the local catalog.

### GitHub

Use for code workflows only.

Rules:

- If the local folder is already a repository, skip and record the reason.
- If the folder is not a repository, analyze the codebase shape and suggest repository creation.
- Respect GitHub file and repository size constraints. Large binaries must not be pushed into normal Git history.

Implementation note:

- Repository creation should be a separate approval step, not an automatic side effect of discovering code.

## Duplicate Detection Model

Nyx should determine existence in this order:

1. Check local catalog for a prior provider match.
2. If missing, check provider-native metadata or app metadata.
3. If still uncertain, fall back to provider listing plus fingerprint comparison.
4. Only upload when the evidence says the object is absent.

Do not rely on:

- filename equality
- folder name equality
- modified time alone

## Folder Structure Strategy

Folder placement needs explicit policy plus heuristics.

Examples:

- `resume`, `cv`, `cover-letter` -> `Resumes/`
- source code by project root name -> repository suggestion, not generic folder creation on GitHub
- camera photos -> `Photos/YYYY/MM/`
- invoices -> `Finance/Invoices/YYYY/`
- unknown files -> `Unsorted/`

This should be rule-based first. Later, a semantic classifier can improve folder suggestions.

## Local Data Model

Use SQLite for the first persisted catalog.

Suggested tables:

### `watched_root`

- `id`
- `path`
- `recursive`
- `include_rules_json`
- `exclude_rules_json`

### `local_file`

- `id`
- `absolute_path`
- `relative_path`
- `size_bytes`
- `sha256`
- `md5`
- `sha1`
- `mime_type`
- `extension`
- `last_modified_at`
- `category`
- `folder_hint`
- `git_repository_root`

### `provider_account`

- `id`
- `provider`
- `account_label`
- `quota_total_bytes`
- `quota_used_bytes`
- `quota_free_bytes`
- `last_quota_sync_at`
- `status`

### `provider_item`

- `id`
- `provider_account_id`
- `provider_item_id`
- `local_file_id`
- `remote_path`
- `provider_hash_json`
- `last_verified_at`

### `sync_job`

- `id`
- `local_file_id`
- `provider_account_id`
- `status`
- `reason`
- `attempt_count`
- `scheduled_at`
- `completed_at`

### `advisory_event`

- `id`
- `kind`
- `severity`
- `title`
- `details_json`
- `created_at`
- `acknowledged_at`

## Event Flow

### New File

1. Watcher sees file create.
2. Stability check waits until writes stop.
3. Fingerprint service computes hashes.
4. Repository detector checks for `.git`.
5. Planner chooses one of:
   - skip existing repository
   - prompt to create repository
   - upload to Google Drive
   - upload to OneDrive
   - defer because no provider has enough space
6. Executor runs upload.
7. Catalog is updated.

### Periodic Advisory

1. Refresh provider quotas.
2. Detect accounts past warning threshold.
3. Rank stale or low-value files by age, category, and replaceability.
4. Compare projected growth to pricing catalog.
5. Generate human review suggestions.

## Phased Delivery Plan

### Phase 0: Product Hardening

- Lock directory allowlist rules.
- Finalize file category taxonomy.
- Finalize provider capability matrix.

### Phase 1: Core Engine MVP

- Config loading
- local file scan
- fingerprinting
- classification
- repository detection
- in-memory planner

### Phase 2: Persistence

- SQLite catalog
- file/provider/job tables
- idempotent rescans

### Phase 3: Storage Providers

- Google Drive adapter
- OneDrive adapter
- quota refresh
- provider duplicate lookup
- folder creation and upload

### Phase 4: Watch Mode

- real-time watcher
- job queue
- retry policy
- crash recovery

### Phase 5: GitHub Workflow Support

- code-folder analysis
- repository suggestion
- repository creation with approval
- first commit bootstrap for non-repo code folders

### Phase 6: Advisory Layer

- quota warnings
- stale file recommendations
- growth forecasting
- pricing and upgrade suggestions

### Phase 7: Productization

- desktop UI or web dashboard
- OAuth account management
- notifications
- logs and diagnostics

## Suggested Repository Structure

```text
nyx/
  docs/
    project-plan.md
  schemas/
    nyx-config.schema.json
  src/
    advisory/
      pricing-catalog.js
    core/
      classify.js
      fingerprint.js
      planner.js
      repository.js
    providers/
      mock-snapshots.js
      provider-contract.js
    cli.js
  nyx.config.example.json
  package.json
  README.md
```

## Security and Compliance Notes

- Store OAuth tokens securely using OS-backed credential storage when possible.
- Never upload secrets from excluded folders.
- Do not auto-delete local files from advisory logic.
- Require explicit confirmation for repository creation and destructive actions.
- Keep a clear audit log of every upload decision.

## Current References

Verified from official docs on 2026-04-17:

- Google Drive API `about` and `files` resources for storage quota and `md5Checksum`
- Google Drive file search and change tracking docs
- Microsoft Graph `drive`, `driveItem`, `file`, `hashes`, and `delta` docs
- GitHub repository contents, repository creation, blob APIs, and repository limits docs
- Google One and Microsoft OneDrive pricing pages

