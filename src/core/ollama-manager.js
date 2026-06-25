// security-bypass: child_process usage
// security-bypass: execSync usage
// security-bypass: spawnSync usage
import { spawn, execSync } from "node:child_process";
import path from "node:path";
import { existsSync } from "node:fs";
import { loadConfig } from "./config.js";

const OLLAMA_TAGS_URL = "http://localhost:11434/api/tags";

let resolvedOllamaCmd = null;

function getOllamaCommand() {
  if (resolvedOllamaCmd) return resolvedOllamaCmd;

  // 1. Try default system PATH command
  try {
    execSync("ollama --version", { stdio: "ignore" });
    resolvedOllamaCmd = "ollama";
    return resolvedOllamaCmd;
  } catch {
    // 2. If it fails, check default Windows installation paths
    if (process.platform === "win32") {
      const localAppData = process.env.LOCALAPPDATA;
      if (localAppData) {
        const defaultPath = path.join(localAppData, "Programs", "Ollama", "ollama.exe");
        if (existsSync(defaultPath)) {
          resolvedOllamaCmd = defaultPath;
          return resolvedOllamaCmd;
        }
      }
      const programFiles = process.env.PROGRAMFILES;
      if (programFiles) {
        const progPath = path.join(programFiles, "Ollama", "ollama.exe");
        if (existsSync(progPath)) {
          resolvedOllamaCmd = progPath;
          return resolvedOllamaCmd;
        }
      }
    }
  }

  // Fallback to default
  return "ollama";
}

async function isOllamaInstalled() {
  try {
    const cmd = getOllamaCommand();
    execSync(`"${cmd}" --version`, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

async function installOllama() {
  console.log("Ollama is not installed. Attempting silent installation via winget...");
  try {
    execSync("winget install Ollama.Ollama --accept-source-agreements --accept-package-agreements", { stdio: "inherit" });
    console.log("Ollama installation command completed.");
    // Clear cache to re-detect full path after installation
    resolvedOllamaCmd = null;
    return true;
  } catch (err) {
    console.error("winget installation failed. Please install Ollama manually from https://ollama.com");
    return false;
  }
}

async function ensureOllamaRunning() {
  try {
    const response = await fetch(OLLAMA_TAGS_URL);
    if (response.ok) return true;
  } catch {
    // Not running
  }

  const cmd = getOllamaCommand();
  console.log(`Ollama service is not running. Starting Ollama from ${cmd}...`);
  try {
    const process = spawn(cmd, ["serve"], {
      detached: true,
      stdio: "ignore",
      windowsHide: true
    });
    process.unref();

    // Wait a few seconds for server startup
    for (let i = 0; i < 5; i++) {
      await new Promise(r => setTimeout(r, 1500));
      try {
        const check = await fetch(OLLAMA_TAGS_URL);
        if (check.ok) {
          console.log("Ollama service started successfully.");
          return true;
        }
      } catch { /* ignore */ }
    }
  } catch (err) {
    console.error("Failed to start Ollama automatically:", err.message);
  }
  return false;
}

async function pullModel(modelName) {
  console.log(`Pulling Ollama model '${modelName}'... This might take a few minutes.`);
  try {
    const response = await fetch("http://localhost:11434/api/pull", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: modelName, stream: false })
    });
    if (response.ok) {
      console.log(`Model '${modelName}' pulled successfully.`);
      return true;
    }
  } catch { /* ignore */ }

  // Fallback to CLI pull
  try {
    const cmd = getOllamaCommand();
    execSync(`"${cmd}" pull ${modelName}`, { stdio: "inherit" });
    console.log(`Model '${modelName}' pulled successfully via CLI.`);
    return true;
  } catch (err) {
    console.error(`Failed to pull model '${modelName}':`, err.message);
    return false;
  }
}

export async function setupOllama() {
  const { config } = await loadConfig();
  const selectedModel = config.ai?.model || "gemma";

  // 1. Check if installed
  const installed = await isOllamaInstalled();
  if (!installed) {
    const installSuccess = await installOllama();
    if (!installSuccess) {
      return {
        available: false,
        serviceRunning: false,
        selectedModel,
        installedModels: [],
        reason: "ollama_not_installed"
      };
    }
  }

  // 2. Ensure running
  const running = await ensureOllamaRunning();
  if (!running) {
    return {
      available: false,
      serviceRunning: false,
      selectedModel,
      installedModels: [],
      reason: "failed_to_start_ollama"
    };
  }

  try {
    const response = await fetch(OLLAMA_TAGS_URL);
    if (!response.ok) {
      throw new Error(`Ollama responded with status ${response.status}`);
    }

    const data = await response.json();
    const installedModels = Array.isArray(data.models)
      ? data.models.map((model) => model.name).filter(Boolean)
      : [];
    let hasSelectedModel = installedModels.some((model) => {
      return model === selectedModel || model === `${selectedModel}:latest` || model.includes(selectedModel);
    });

    // 3. Auto-pull model if missing
    if (!hasSelectedModel) {
      const pullSuccess = await pullModel(selectedModel);
      if (pullSuccess) {
        hasSelectedModel = true;
        installedModels.push(selectedModel);
      }
    }

    return {
      available: hasSelectedModel,
      serviceRunning: true,
      selectedModel,
      installedModels,
      reason: hasSelectedModel ? "ready" : "model_not_installed"
    };
  } catch (error) {
    return {
      available: false,
      serviceRunning: false,
      selectedModel,
      installedModels: [],
      reason: error.message
    };
  }
}
