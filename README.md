# Nyx: Intelligent File Organization & Protection

![Nyx Banner](banner.svg)

Nyx is a high-integrity, safety-first file management system designed to bring order to chaotic local directories and protect your most important data through automated, approval-gated workflows.

## 🚀 The Nyx Workflow

Nyx operates on a **Human-in-the-Loop** model. It never moves or deletes a file without your explicit approval.

1.  **Local Audit**: Deep scan of user-approved roots with SHA-256 fingerprinting.
2.  **Intelligence**: Automatically detects duplicates (by hash), versioned files (`v1`, `v2`), and classifies content (Finance, Legal, Code, etc.).
3.  **Proposal**: Generates a persistent review queue in SQLite with suggested renames and organizational moves.
4.  **Review**: You approve or reject suggestions via CLI (or the upcoming Web Dashboard).
5.  **Execution**: Nyx safely applies changes, validates fingerprints before every move, and maintains a rollback-ready audit log.
6.  **Protection**: Redundantly backs up important categories to cloud storage (Mock Cloud for now, real APIs coming soon).

## ✨ Key Features

*   **⚡ Incremental Scanning**: Powered by SQLite, Nyx tracks file stats to skip unchanged files, making rescans of thousands of files near-instant.
*   **🧠 Purpose-Based Rules**: Granular detection patterns for Insurance policies, Utility bills, Bank statements, Resumes, and more.
*   **📦 Version Management**: Automatically identifies older versions of documents and proposes archival to keep your primary folders clean.
*   **🛡️ Safety First**:
    *   **Fingerprint Validation**: Ensures a file hasn't changed between proposal and execution.
    *   **Rollback Engine**: Undo any organization run with a single command.
    *   **Managed Roots**: Nyx only touches what you tell it to in `docs/engagement.md`.
*   **📊 Persistent Catalog**: Full SQLite backend for metadata storage, ensuring scalability and durability.

## 🛠️ Installation & Setup

```bash
# Clone the repository
git clone https://github.com/ptkvaibhav/nyx.git
cd nyx

# Install dependencies and link globally
npm install
npm link

# Now you can use the `nyx` command from anywhere!
nyx

# Initialize your engagement (what Nyx can scan)
# Edit docs/engagement.md to add your folders
```

## ⌨️ Common Commands

| Command | Description |
| :--- | :--- |
| `nyx` | Launches the React-based Visual Dashboard automatically. |
| `nyx audit-local` | Performs a full scan of managed directories. |
| `nyx prepare-local-organization` | Generates suggestions for moves and renames. |
| `nyx local-organization-status` | Views the current pending review queue. |
| `nyx approve-local-organization all` | Approves all organization proposals. |
| `nyx apply-local-organization` | Executes the approved changes on disk. |
| `nyx rollback-local-organization` | Undoes the last set of organization actions. |

## 🧪 Verification

Nyx is built with quality as a first-class citizen:

*   **Quality**: `npm run check:quality`
*   **Security**: `npm run check:security`
*   **Testing**: `npm test` & `npm run test:smoke`

---

## 🗺️ Roadmap

- [x] SQLite Metadata Storage
- [x] Incremental Scanning Logic
- [x] Version & Purpose Intelligence
- [x] Rollback System
- [x] React-based Visual Dashboard
- [ ] **Next**: Google Drive & OneDrive Integration
- [ ] Duplicate Suffix Intelligence (`(1)`, `(2)`)
