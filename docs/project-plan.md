# Nyx Project Plan

## Goal

Build a file organization system that audits user-approved local directories, identifies duplicates and safe irrelevance candidates, proposes structure and naming improvements, mirrors that organization to cloud storage, and then protects important content with verified backups.

## Product Workflow

### 1. Local Audit

- scan only the directories the user approved
- fingerprint files by content
- classify file type and likely purpose
- detect duplicates
- identify stale and safe irrelevance candidates
- determine whether files are structured or unstructured

### 2. Review

- show duplicate evidence
- show irrelevance evidence
- show rename and move proposals
- ask for confirmation before mutation

### 3. Local Organization

- rename files using user-approved naming rules
- move files into the best existing folder
- create new folders only when no suitable destination exists
- log every action for rollback and auditability

### 4. Cloud Audit And Organization

- inspect supported cloud providers
- apply the same duplicate, structure, and naming rules there
- organize cloud storage to mirror local structure with a cleaner taxonomy where useful

### 5. Protect Important Content

- back up important categories and folders redundantly
- verify remote object proof before marking a file protected

### 6. Archive Lower-Priority Content

- upload lower-priority files to cloud storage
- verify upload proof
- ask for confirmation
- only then remove the local copy

## Non-Negotiable Rules

### Scope Control

- Nyx may only scan directories listed in `docs/engagement.md`.
- All other paths are out of scope and must be ignored.

### Approval Gates

Nyx must ask the user before:

- renaming files
- moving files in batch
- deleting duplicates
- deleting irrelevant files
- deleting a local copy after verified cloud backup

### Evidence First

Every mutation proposal must include evidence:

- duplicate proof: shared content hash and file paths
- irrelevance proof: matched rule and supporting metadata
- rename proof: current name, proposed name, and reason
- move proof: current folder, target folder, and reason
- backup proof: provider, remote path or ID, verification timestamp

## Structured vs Unstructured Definition

A file is considered structured only when:

- file content matches the file name
- file is placed in an appropriate folder for that name and content
- there is no obvious better destination

Anything else is unstructured or weakly structured and should be surfaced during review.

## Safe Irrelevance Rules

Initial irrelevance support must remain conservative and review-only.

Safe starter rules:

- exact duplicate files by content hash
- older installers when a newer installer for the same product exists
- flight tickets older than 2 years
- train tickets older than 2 years
- old resumes when a newer resume for the same person exists
- superseded exports or generated reports when a newer copy exists

These rules should remain configurable and user-reviewed in `docs/engagement.md`.

## Naming Strategy

Nyx must use category-specific naming rules and require confirmation before rename execution.

Initial examples:

- latest resume: `Name_Resume.ext`
- travel tickets: `TicketType_From_to_To_Date.ext`

The final naming system should support:

- per-category templates
- date normalization
- version suffix rules
- safe preview mode before applying renames

## Architecture

### Core Modules

1. Engagement Parser
   - Reads managed directories, safe irrelevance rules, naming guidance, important categories, and approval requirements from the engagement markdown.

2. Local Scanner
   - Walks approved roots only.
   - Applies exclusions strictly.
   - Emits file candidates for cataloging.

3. Fingerprint Service
   - Computes SHA-256 as the primary duplicate key.
   - Stores size, extension, modified time, and compatibility hashes when useful.

4. Content Classifier
   - Classifies file category and likely purpose.
   - Detects content hints such as resume, ticket, installer, invoice, archive, source code, or personal media.

5. Structure Analyzer
   - Scores whether a file is already well placed and well named.
   - Produces structured, weakly structured, or unstructured outcomes.

6. Duplicate Engine
   - Groups exact duplicates by hash.
   - Produces review evidence without deleting anything automatically.

7. Relevance Engine
   - Applies conservative review rules for stale or irrelevant files.
   - Produces explanations and confidence levels.

8. Naming And Folder Proposal Engine
   - Suggests filenames and folder destinations based on category and existing structure.

9. Review Queue
   - Stores rename, move, delete, and archive proposals waiting for user approval.

10. Execution Engine
    - Applies only approved changes.
    - Writes an audit trail and rollback metadata.

11. Cloud Provider Layer
    - Audits cloud providers using the same classification and structure rules.
    - Stores backup proof and remote metadata.

12. Protection Planner
    - Ensures important files have redundant storage.
    - Marks low-priority files eligible for cloud-only archival.

## Data Model Direction

The first persisted catalog should track:

- managed roots
- local files
- content hashes
- structure scores
- duplicate groups
- irrelevance findings
- rename and move proposals
- approval state
- backup proof
- cloud item mappings

SQLite remains the right first persistence layer for this.

## Delivery Plan

### V1: Repository And Workflow Alignment

- engagement template
- product docs
- verification scripts
- local mock-drive scaffold

### V2: Local Audit Foundation

- parse engagement rules
- scan approved roots only
- fingerprint files
- classify files
- detect duplicates
- report structured vs unstructured files

### V3: Review And Organization Proposals

- rename proposal engine
- folder proposal engine
- irrelevance review engine
- user approval queue

### V4: Local Execution

- apply approved renames and moves
- apply approved duplicate deletion
- record audit and rollback metadata

### V5: Cloud Audit

- Google Drive and OneDrive audit
- cloud duplicate detection
- cloud structure review

### V6: Protection And Archive

- redundant backup proof for important categories
- cloud-only archival flow for lower-priority files

## Security And Safety

- never mutate files outside approved roots
- never delete without explicit confirmation
- never trust filenames alone for identity
- keep an audit log for every proposed and applied action
- treat cloud archival as destructive until verified otherwise

