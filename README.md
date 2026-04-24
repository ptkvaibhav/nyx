# Nyx

Nyx is a file organization and protection system for user-approved directories.

The product flow is:

1. audit local files inside approved roots only
2. detect duplicates, stale files, and safe irrelevance candidates
3. separate structured files from unstructured files
4. propose renames and folder moves with user confirmation
5. apply the same audit and organization model to connected cloud storage
6. protect important files with redundant backups
7. archive lower-priority files to cloud-only storage after verified backup and explicit approval

## Product Rules

- Nyx must only scan directories listed by the user in [docs/engagement.md](/C:/Users/ptkva/Documents/nyx/docs/engagement.md).
- Nyx must never rename, move, or delete files without showing evidence and obtaining approval.
- Duplicates are proven by content fingerprint, not filename.
- Irrelevance is heuristic and review-only.
- Important files should keep a local copy and a cloud backup.
- Lower-priority files may become cloud-only, but only after upload proof and user confirmation.

## Current Repository State

The repository currently contains:

- the engagement template for user-approved scan roots and approval rules
- the product plan and roadmap
- a local mock-drive scaffold for storage experiments
- a local audit foundation for engagement parsing, duplicate detection, and structure scoring
- verification tooling for quality, security, unit, and smoke checks

The mock `Drive/` implementation is not the final product. It is a safe local scaffold used to validate file selection, routing, duplicate checks, and review gates before real cloud integrations are introduced.

## Current Commands

```bash
node src/cli.js plan
node src/cli.js doctor
node src/cli.js demo
node src/cli.js engagement-summary [engagement-path]
node src/cli.js audit-local [engagement-path]
node src/cli.js init-drive
node src/cli.js drive-status
node src/cli.js sync-file <file-path>
node src/cli.js fingerprint <file-path>
node src/cli.js classify <file-path>
npm run check:quality
npm run check:security
npm run test:smoke
npm test
```

## Operating Model

### Phase 1: Audit

- scan only approved directories
- parse engagement rules and default exclusions
- fingerprint files
- classify file types
- detect duplicates
- flag stale or safe irrelevance candidates
- score structured vs unstructured files

### Phase 2: Organize

- propose folder destinations
- propose filename changes per category naming rules
- show evidence for each move or rename
- execute only after user approval

### Phase 3: Cloud Audit

- inspect connected cloud storage
- detect duplicates and structure problems there too
- reconcile local and cloud structure

### Phase 4: Protect And Archive

- back up important categories redundantly
- verify backup proof
- move low-priority content to cloud-only storage when approved

## Key Documents

- [docs/engagement.md](/C:/Users/ptkva/Documents/nyx/docs/engagement.md): user-approved scan scope, naming rules, safe irrelevance rules, important categories, and approval gates
- [docs/project-plan.md](/C:/Users/ptkva/Documents/nyx/docs/project-plan.md): detailed architecture and phased delivery plan
- [docs/roadmap.md](/C:/Users/ptkva/Documents/nyx/docs/roadmap.md): short implementation roadmap
- [Drive/README.md](/C:/Users/ptkva/Documents/nyx/Drive/README.md): notes on the current local mock-drive scaffold

## Verification

The scaffold is expected to pass:

- `npm run check:quality`
- `npm run check:security`
- `npm test`
- `npm run test:smoke`
- `npm audit --json`
