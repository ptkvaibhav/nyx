# Drive

This folder is the local mock-cloud target for the first Nyx scaffold.

Nyx will create and use:

- `Drive/GoogleDrive/`
- `Drive/OneDrive/`
- `Drive/.nyx-drive-state.json`

This lets us validate routing, folder placement, dedupe, and quota behavior before wiring real provider APIs.
