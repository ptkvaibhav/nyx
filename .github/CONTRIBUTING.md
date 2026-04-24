# Contributing To Nyx

Nyx is built around user approval and evidence-first file operations. Contributions should preserve those rules.

## Core Principles

- scan only approved directories
- never rename, move, or delete without review
- prove duplicates by content fingerprint
- treat irrelevance as review-only
- require backup proof before local deletion after archival

## Branching

- `main`: stable repository branch
- `v1`: repository-facing docs and workflow alignment
- `v2*`: file organization implementation branches

## Before Opening A PR

Run:

```bash
npm run check:quality
npm run check:security
npm test
npm run test:smoke
```

If dependencies change, also run:

```bash
npm audit --json
```

## Review Standard

Every behavior change should answer:

- what evidence does Nyx show the user
- what user approval gate applies
- what paths are in scope
- what rollback or audit information is preserved

