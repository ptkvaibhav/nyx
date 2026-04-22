export function createMockProviderSnapshots() {
  return [
    {
      id: "googleDrive",
      availableBytes: 120 * 1024 * 1024 * 1024,
      knownFingerprints: new Set()
    },
    {
      id: "oneDrive",
      availableBytes: 40 * 1024 * 1024 * 1024,
      knownFingerprints: new Set()
    },
    {
      id: "github",
      availableBytes: 5 * 1024 * 1024 * 1024,
      knownFingerprints: new Set()
    }
  ];
}

