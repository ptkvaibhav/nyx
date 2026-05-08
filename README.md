# Nyx: True AI Intelligence & File Organization

![Nyx Banner](banner.svg)

Nyx is a high-integrity, safety-first file management system designed to bring order to chaotic local directories and protect your most important data through local AI-driven semantic reasoning. 

Nyx strictly refuses to delete files or mutate directories outside of explicitly approved roots. It verifies backup proof before recommending archival and maintains a rollback trail for every action.

## 🚀 True AI Intelligence (V5)
Nyx has evolved from static rules to true semantic understanding. Powered by a local **Ollama** integration (using compact models like Gemma), Nyx deeply understands the context of your files.
- **Deep Content Extraction:** Nyx reads the raw text of your documents (like PDFs, handling passwords securely) to intelligently extract metadata (e.g. Assessment Years from Form 16s).
- **AI-Driven Exclusions:** Nyx reasons about folder structures and proactively recommends ignoring massive technical toolsets (`node_modules`, system packages) to speed up analysis.
- **Semantic Renaming:** The AI proposes clean, standardized names and explains *why* it chose them.

## 🛠️ Installation & Setup

```bash
# Clone the repository
git clone https://github.com/ptkvaibhav/nyx.git
cd nyx

# Install dependencies and link globally
npm install
npm link

# Install Ollama
# Ensure you have https://ollama.com installed and running.
```

## ⌨️ Common Commands

| Command | Description |
| :--- | :--- |
| `nyx` | Launches the interactive React Web Dashboard powered by AI reasoning. Automatically manages UI building and Ollama setup. |
| `nyx doctor` | Performs a system health check to ensure dependencies and configurations are correct. |

*Note: As of V5, pure batch CLI commands (like `audit-local` or `prepare-local-organization`) are deprecated in favor of the interactive UI wizard.*

## 🧪 Verification & Security

Nyx is built with quality and security as first-class citizens:

*   **Quality & Semantic Analysis**: `npm run check:quality`
*   **Security & Dependency Checks**: `npm run check:security` & `npm audit`
*   **Linting**: The UI is strictly typed and linted.
*   **Data Flow Security**: All AI processing runs **locally** on your device via Ollama. Your documents and passwords are never sent to the cloud.

---

## 🗺️ Roadmap

- [x] SQLite Metadata Storage
- [x] Incremental Scanning Logic
- [x] Version & Purpose Intelligence
- [x] Rollback System
- [x] React-based Visual Dashboard
- [x] Duplicate Suffix Intelligence (`(1)`, `(2)`)
- [x] **V5:** True AI Intelligence (Local LLM reasoning & Interactive Wizard)
- [ ] **V6**: Google Drive & OneDrive Integration