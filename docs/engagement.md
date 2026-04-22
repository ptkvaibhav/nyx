# Nyx Engagement

This file controls what Nyx is allowed to inspect and how it should classify, organize, and protect files.

## Managed Directories

Nyx must only scan directories listed here. All other paths are out of scope and must be ignored.

Current selection:

- `C:\Users\ptkva`

User notes:

- Add or remove managed directories here before running a full scan.
- System-wide scanning is not allowed outside these approved roots.

## Safe Irrelevant File Rules

Nyx should begin with a conservative review-only rule set. Nothing in this list may be deleted without showing proof and receiving user confirmation.

Suggested starter rules:

- exact duplicate files by content hash
- older installers when a newer installer for the same product is present
- flight tickets older than 2 years
- train tickets older than 2 years
- old resumes when a newer resume for the same person exists
- expired exports or generated reports that are newer elsewhere

User review:

- Add file patterns that are obviously disposable for your workflow.
- Remove rules that are too aggressive for your files.

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

Nyx should treat these as important by default until the user confirms otherwise:

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
- confirm which low-priority categories may become cloud-only after verified backup

## Approval Gates

Nyx must ask the user before:

- renaming files
- moving files in batch
- deleting duplicates
- deleting irrelevant files
- deleting a local copy after confirmed cloud backup

