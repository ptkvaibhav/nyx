import { classifyFile } from "./classify.js";
import { findGitRepositoryRoot } from "./repository.js";

export async function buildBackupPlan({ fileProfile, providerSnapshots, routingPreferences = {} }) {
  const classification = classifyFile(fileProfile);
  const preferredProviders = routingPreferences[classification.category] ?? classification.relevantProviders;

  if (classification.category === "code") {
    const repositoryRoot = await findGitRepositoryRoot(fileProfile.absolutePath);

    if (repositoryRoot) {
      return {
        action: "skip",
        reason: "File is inside an existing Git repository.",
        classification,
        repositoryRoot
      };
    }

    return {
      action: "prompt_create_repository",
      reason: "Code file is not inside a Git repository.",
      classification,
      repositoryRoot: null
    };
  }

  const eligibleProviders = providerSnapshots
    .filter((provider) => preferredProviders.includes(provider.id))
    .filter((provider) => provider.availableBytes >= fileProfile.sizeBytes);

  if (eligibleProviders.length === 0) {
    return {
      action: "defer",
      reason: "No relevant provider has enough free space.",
      classification
    };
  }

  const existingMatch = eligibleProviders.find((provider) => {
    return provider.knownFingerprints.has(fileProfile.sha256);
  });

  if (existingMatch) {
    return {
      action: "skip",
      reason: "Matching file fingerprint already exists on a connected provider.",
      classification,
      selectedProvider: existingMatch.id
    };
  }

  const selectedProvider = [...eligibleProviders].sort((left, right) => {
    return right.availableBytes - left.availableBytes;
  })[0];

  return {
    action: "upload",
    reason: "Selected the relevant provider with the most free space.",
    classification,
    selectedProvider: selectedProvider.id,
    destinationPath: classification.folderSegments.join("/")
  };
}
