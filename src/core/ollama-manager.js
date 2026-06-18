import { loadConfig } from "./config.js";

const OLLAMA_TAGS_URL = "http://localhost:11434/api/tags";

export async function setupOllama() {
  const { config } = await loadConfig();
  const selectedModel = config.ai?.model || "gemma";

  try {
    const response = await fetch(OLLAMA_TAGS_URL);
    if (!response.ok) {
      throw new Error(`Ollama responded with status ${response.status}`);
    }

    const data = await response.json();
    const installedModels = Array.isArray(data.models)
      ? data.models.map((model) => model.name).filter(Boolean)
      : [];
    const hasSelectedModel = installedModels.some((model) => {
      return model === selectedModel || model === `${selectedModel}:latest` || model.includes(selectedModel);
    });

    if (!hasSelectedModel) {
      console.warn(`Ollama is running, but model '${selectedModel}' is not installed.`);
      console.warn(`Install it with: ollama pull ${selectedModel}`);
    }

    return {
      available: hasSelectedModel,
      serviceRunning: true,
      selectedModel,
      installedModels,
      reason: hasSelectedModel ? "ready" : "model_not_installed"
    };
  } catch (error) {
    console.warn("Ollama is not available. Nyx will continue with deterministic rules.");
    console.warn("Start Ollama manually and install the configured model to enable AI reasoning.");
    return {
      available: false,
      serviceRunning: false,
      selectedModel,
      installedModels: [],
      reason: error.message
    };
  }
}
