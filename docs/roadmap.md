# Nyx Roadmap

## V1 - Implemented

- align repository docs with the real product
- keep the local mock-drive scaffold as a safe storage test harness
- define engagement and approval workflow

## V2 - Implemented

- implement local audit foundation
- parse engagement rules
- scan approved directories only
- detect duplicates
- score structured vs unstructured files

## V3 - Implemented

- propose renames and folder moves
- add irrelevance review engine
- build approval queue
- expose local-first organization commands

## V4 - Implemented For Local Files

- apply approved local organization changes
- add rollback metadata and audit trail
- keep generic review commands as aliases behind the clearer local organization workflow

## V5 - Mock Provider Implemented, Real APIs Pending

- audit and organize cloud providers
- verify backup proof for important content

Current implementation:

- audits the local mock Drive scaffold
- records backup proof for local Drive uploads and dedupe skips
- reports duplicate fingerprints across mock providers

Pending real-provider work:

- Google Drive API audit
- OneDrive API audit
- cloud-side move and rename proposals

## V6 - Mock Provider Implemented, Real APIs Pending

- report important files that still need backup proof
- create approval-gated archive proposals for lower-priority files with verified mock-cloud proof
- delete local copies only after approval and backup fingerprint verification

Pending real-provider work:

- cloud archival against Google Drive and OneDrive APIs
- durable catalog storage for protection and archive state
