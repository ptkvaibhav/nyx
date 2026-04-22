# Nyx Engagement

This file defines what Nyx is allowed to scan and how it should treat files during audit, organization, backup, and archival.

Nyx must treat this file as the source of truth for scan scope and user review rules.

## Managed Directories

Nyx must only scan directories listed here. All other paths are out of scope and must be ignored.

Current selection:

- `C:\Users\ptkva`

User notes:

- Add or remove managed directories here before running a full scan.
- Do not include system directories unless you explicitly want them reviewed.
- Nyx must never mutate files outside these approved roots.

## Safe Irrelevance File Rules

Nyx should begin with a conservative review-only rule set. Nothing in this list may be deleted without showing proof and receiving user confirmation.

Suggested starter rules:

- exact duplicate files by content hash
- older installers when a newer installer for the same product is present
- flight tickets older than 2 years
- train tickets older than 2 years
- old resumes when a newer resume for the same person exists
- superseded exports or generated reports that have a newer replacement

User review:

- Add file patterns that are obviously disposable for your workflow.
- Remove rules that are too aggressive for your files.
- Expand the list only after reviewing real findings.

## Structured File Definition

A file is considered structured only when all of the following are true:

- file content matches the file name
- file is placed in an appropriate folder for that name and content
- there is no obvious better destination

## Naming Guidance

Nyx must ask for confirmation before applying renames.

Current naming guidance by file type:

- latest resume: `Name_Resume.ext`
- travel tickets: `TicketType_From_to_To_Date.ext`
- all other categories: pending user confirmation before rename rules are finalized

Pending confirmation:

- preferred date format
- preferred separator style
- version suffix style
- naming rules for finance, identity, education, legal, and project documents

## Important Files And Folders

Nyx should treat these as important by default until the user confirms otherwise.

Important file categories:

- resumes and CVs
- identity documents
- contracts and legal records
- education certificates and transcripts
- financial records, invoices, and tax documents
- health and insurance documents
- travel tickets and itineraries within retention rules
- personal photos and videos
- active project documents

Important folder candidates once structure exists:

- `Documents`
- `Resumes`
- `Finance`
- `Identity`
- `Education`
- `Legal`
- `Projects`
- `Photos`

User confirmation required:

- confirm which categories are important
- confirm which folders should always keep a local copy plus a cloud backup
- confirm which lower-priority categories may become cloud-only after verified backup

## Cloud Mirroring

Nyx should organize cloud storage using the same overall structure as local storage, but it may use a cleaner taxonomy where needed.

Examples:

- preserve major category folders across local and cloud
- simplify noisy local nesting when cloud placement is clearer
- keep important content easy to locate in both places

## Approval Gates

Nyx must ask the user before:

- renaming files
- moving files in batch
- deleting duplicates
- deleting irrelevant files
- deleting a local copy after confirmed cloud backup

