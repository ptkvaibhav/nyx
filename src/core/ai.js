import { loadConfig } from "./config.js";

const OLLAMA_URL = "http://localhost:11434/api/chat";
let OLLAMA_MODEL = "gemma"; 
let aiStatus = {
  available: false,
  model: OLLAMA_MODEL,
  reason: "not_checked",
  checkedAt: null
};
let warnedUnavailable = false;

export async function initAI(mock = false) {
  if (mock) {
    aiStatus = {
      available: true,
      model: "mock",
      reason: "mock",
      checkedAt: new Date().toISOString()
    };
    return aiStatus;
  }
  
  try {
    const { config } = await loadConfig();
    if (config.ai?.model) {
      OLLAMA_MODEL = config.ai.model;
    }

    // Ping Ollama to see if it's running
    const response = await fetch("http://localhost:11434/api/tags");
    if (!response.ok) {
      throw new Error(`Ollama responded with status: ${response.status}`);
    }
    const data = await response.json();
    const models = Array.isArray(data.models) ? data.models.map(m => m.name).filter(Boolean) : [];
    
    let modelFound = models.some((m) => m === OLLAMA_MODEL || m.includes(OLLAMA_MODEL));
    if (!modelFound && models.length > 0) {
      const fallbackModel = models[0];
      console.warn(`Configured model '${OLLAMA_MODEL}' not found. Dynamically falling back to installed model: '${fallbackModel}'`);
      OLLAMA_MODEL = fallbackModel;
      modelFound = true;
    }

    aiStatus = {
      available: models.length > 0,
      model: OLLAMA_MODEL,
      reason: modelFound ? "ready" : "model_not_found",
      checkedAt: new Date().toISOString(),
      models
    };
    warnedUnavailable = false;
    
    if (models.length > 0 && !models.some(m => m.includes("gemma")) && typeof process !== "undefined" && process.env.NODE_ENV !== "test") {
      console.warn("Warning: 'gemma' model not found in Ollama. Make sure to run `ollama run gemma`.");
    }
  } catch (error) {
    aiStatus = {
      available: false,
      model: OLLAMA_MODEL,
      reason: error.message,
      checkedAt: new Date().toISOString()
    };

    if (!warnedUnavailable && typeof process !== "undefined" && process.env.NODE_ENV !== "test" && !process.env.NODE_TEST_CONTEXT) {
      console.warn(`AI unavailable; continuing with deterministic rules. Reason: ${error.message}`);
      warnedUnavailable = true;
    }
  }

  return aiStatus;
}

export async function askAI(prompt, systemPrompt = "You are a helpful file organization AI. You must respond in valid JSON format.") {
  if (aiStatus.reason === "not_checked") {
    await initAI();
  }

  if (!aiStatus.available) {
    return JSON.stringify({
      error: "AI unavailable",
      degraded: true,
      reason: aiStatus.reason
    });
  }

  try {
    const response = await fetch(OLLAMA_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: prompt }
        ],
        stream: false,
        format: "json"
      })
    });

    if (!response.ok) {
      throw new Error(`Ollama API error: ${response.statusText}`);
    }

    const data = await response.json();
    return data.message.content;
  } catch (error) {
    aiStatus = {
      available: false,
      model: OLLAMA_MODEL,
      reason: error.message,
      checkedAt: new Date().toISOString()
    };

    if (!warnedUnavailable) {
      console.warn(`AI unavailable; continuing with deterministic rules. Reason: ${error.message}`);
      warnedUnavailable = true;
    }

    return JSON.stringify({
      error: "Failed to generate AI response.",
      degraded: true,
      reason: error.message
    });
  }
}

export function getAIStatus() {
  return { ...aiStatus };
}
