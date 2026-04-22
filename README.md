# Nyx

Nyx is a local backup router that watches user-approved directories, fingerprints files, chooses the right cloud target, and keeps a local catalog so it can avoid duplicate uploads and make quota-aware decisions.

This repository currently contains:

- A detailed project plan and architecture.
- An engagement template for user-approved scan scope and review rules.
- A runnable Node.js scaffold for the core decision engine.
- A local mock-cloud scaffold rooted in `Drive/` for Google Drive and OneDrive simulation.
- Config examples for watched directories, provider routing, and policy rules.

## Why this shape

The core product problem is not "upload files to cloud providers." The real problem is safe routing:

- Identify a file by content, not by mutable names.
- Respect provider capabilities and limits.
- Keep GitHub scoped to code workflows.
- Avoid touching existing repositories automatically.
- Make placement decisions with quota and policy awareness.

## Current commands

These commands use only Node.js and do not require external dependencies yet.

```bash
node src/cli.js plan
node src/cli.js doctor
node src/cli.js demo
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

Review the engagement inputs in [docs/engagement.md](/C:/Users/ptkva/Documents/nyx/docs/engagement.md) before broadening the scan scope.

## Local Mock Drive

The first scaffold writes into a local `Drive/` folder instead of real cloud accounts:

- `Drive/GoogleDrive/`
- `Drive/OneDrive/`
- `Drive/.nyx-drive-state.json`

This mode is meant to validate:

- watched-root and exclusion policy
- file fingerprinting and duplicate detection
- provider selection by available space
- document routing into category folders
- code-folder skip and prompt behavior

## Planned next steps

1. Add a persisted local catalog, ideally SQLite.
2. Add the filesystem watcher and job queue.
3. Replace the local mock Drive with real OAuth-backed Google Drive and OneDrive adapters.
4. Add GitHub repository suggestion and creation flows for code directories.
5. Add advisory jobs for quota pressure, stale files, and plan upgrades.

See [docs/project-plan.md](/C:/Users/ptkva/Documents/nyx/docs/project-plan.md) for the detailed design.
