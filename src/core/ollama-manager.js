import { execSync, spawn } from "node:child_process";
import readline from "node:readline";
import process from "node:process";
import { loadConfig, saveConfig } from "./config.js";

const MODELS = [
  { id: "gemma", name: "Gemma (Standard, Great balance of speed and intelligence)" },
  { id: "gemma:2b", name: "Gemma 2B (Fastest, Good for Mobile/Laptops)" },
  { id: "llama3:8b", name: "Llama 3 8B (Smarter, Needs 8GB+ RAM)" },
  { id: "phi3:mini", name: "Phi 3 Mini (Great reasoning, Lightweight)" }
];

export async function setupOllama() {
  console.log("Checking AI engine prerequisites...");
  
  if (!isOllamaInstalled()) {
    console.log("Ollama is not installed. Installing Ollama...");
    installOllama();
  }

  await ensureOllamaRunning();

  const installedModels = await getInstalledModels();
  const { config, configPath } = await loadConfig();
  
  let selectedModel = config.ai?.model;
  
  if (!selectedModel) {
    selectedModel = await promptModelSelection(installedModels);
    config.ai = { ...config.ai, model: selectedModel };
    await saveConfig(config, configPath);
  }

  // Resolve to actual installed model if it's a close match to avoid re-downloading
  const exactMatch = installedModels.find(m => m === selectedModel || m === `${selectedModel}:latest`);
  const partialMatch = installedModels.find(m => m.includes(selectedModel));
  
  if (exactMatch || partialMatch) {
    const finalModel = exactMatch || partialMatch;
    if (finalModel !== selectedModel) {
      console.log(`Auto-resolved '${selectedModel}' to installed model '${finalModel}'.`);
      selectedModel = finalModel;
      config.ai.model = finalModel;
      await saveConfig(config, configPath);
    }
  } else {
    console.log(`Model '${selectedModel}' not found locally. Downloading...`);
    pullModel(selectedModel);
  }
  
  console.log(`AI engine ready using model: ${selectedModel}`);
  return selectedModel;
}

async function getInstalledModels() {
  try {
    const response = await fetch("http://localhost:11434/api/tags");
    if (response.ok) {
      const data = await response.json();
      return data.models.map(m => m.name);
    }
  } catch {}
  return [];
}

function isOllamaInstalled() {
  try {
    execSync("ollama --version", { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function installOllama() {
  try {
    if (process.platform === "win32") {
      execSync("winget install Ollama.Ollama -e --silent", { stdio: "inherit" });
    } else if (process.platform === "darwin") {
      execSync("brew install ollama", { stdio: "inherit" });
    } else {
      execSync("curl -fsSL https://ollama.com/install.sh | sh", { stdio: "inherit" });
    }
  } catch (error) {
    console.error("Failed to automatically install Ollama. Please install it manually from https://ollama.com");
    process.exit(1);
  }
}

async function ensureOllamaRunning() {
  try {
    await fetch("http://localhost:11434/api/tags");
  } catch {
    console.log("Starting Ollama background service...");
    const subprocess = spawn("ollama", ["serve"], {
      detached: true,
      stdio: "ignore",
      windowsHide: true
    });
    subprocess.unref();
    
    // Wait for it to start
    for (let i = 0; i < 10; i++) {
      await new Promise(r => setTimeout(r, 1000));
      try {
        await fetch("http://localhost:11434/api/tags");
        return;
      } catch {}
    }
    console.warn("Ollama service might not have started correctly, but we will continue.");
  }
}

async function promptModelSelection() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  console.log("\n=========================================");
  console.log("     Select an AI Model for Nyx          ");
  console.log("=========================================");
  MODELS.forEach((m, i) => {
    console.log(` ${i + 1}) ${m.name} (${m.id})`);
  });
  console.log("=========================================\n");

  return new Promise((resolve) => {
    const ask = () => {
      rl.question("Enter the number of your choice (default 1): ", (answer) => {
        const choice = parseInt(answer.trim(), 10);
        if (!answer.trim() || choice === 1) {
          rl.close();
          resolve(MODELS[0].id);
        } else if (choice > 1 && choice <= MODELS.length) {
          rl.close();
          resolve(MODELS[choice - 1].id);
        } else {
          console.log("Invalid choice. Please try again.");
          ask();
        }
      });
    };
    ask();
  });
}

function pullModel(model) {
  try {
    execSync(`ollama pull ${model}`, { stdio: "inherit" });
  } catch (error) {
    console.error(`Failed to pull model ${model}.`, error.message);
  }
}