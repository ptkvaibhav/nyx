import { loadConfig } from "./config.js";
import { setupOllama } from "./ollama-manager.js";

const OLLAMA_URL = "http://localhost:11434/api/chat";
let OLLAMA_MODEL = "gemma"; 
let aiStatus = {
  available: false,
  model: OLLAMA_MODEL,
  reason: "not_checked",
  checkedAt: null
};
let warnedUnavailable = false;

let initInProgress = null;

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

  // Bypass AI setup and return unavailable in unit tests to ensure deterministic runs
  if (typeof process !== "undefined" && (process.env.NODE_TEST_CONTEXT || process.env.NODE_ENV === "test")) {
    aiStatus = {
      available: false,
      model: OLLAMA_MODEL,
      reason: "test_bypass",
      checkedAt: new Date().toISOString()
    };
    return aiStatus;
  }

  if (initInProgress) {
    return initInProgress;
  }

  initInProgress = (async () => {
    try {
      const { config } = await loadConfig();
      if (config.ai?.model) {
        OLLAMA_MODEL = config.ai.model;
      }

      // Call setupOllama to ensure it is installed, running, and the model is pulled!
      const ollamaStatus = await setupOllama();
      
      // Update active model from what setupOllama resolved
      OLLAMA_MODEL = ollamaStatus.selectedModel || OLLAMA_MODEL;

      aiStatus = {
        available: ollamaStatus.available,
        model: OLLAMA_MODEL,
        reason: ollamaStatus.reason,
        checkedAt: new Date().toISOString(),
        models: ollamaStatus.installedModels
      };
      warnedUnavailable = false;
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
    } finally {
      initInProgress = null;
    }
    return aiStatus;
  })();

  return initInProgress;
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

export function robustParseJSON(str) {
  let cleaned = str.trim();
  
  // 1. Remove markdown block formatting if present
  const match = cleaned.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (match) {
    cleaned = match[1].trim();
  }
  
  // 2. Fix unescaped backslashes in paths/strings.
  // Replace any backslash that is not followed by a valid JSON escape character (", \, /, b, f, n, r, t, u)
  cleaned = cleaned.replace(/\\(?!["\\/bfnrtu])/g, "/");

  try {
    return JSON.parse(cleaned);
  } catch (e) {
    try {
      const keys = ["category", "purpose", "expectedFolder", "proposedName", "reasoning"];
      const repairedObj = {};
      
      for (const key of keys) {
        const keyRegex = new RegExp(`"${key}"\\s*:\\s*"`, 'i');
        const keyMatch = cleaned.match(keyRegex);
        if (keyMatch) {
          const startIndex = keyMatch.index + keyMatch[0].length;
          
          let valueEndIndex = -1;
          let tempIndex = startIndex;
          while (tempIndex < cleaned.length) {
            const nextQuote = cleaned.indexOf('"', tempIndex);
            if (nextQuote === -1) break;
            
            const afterQuote = cleaned.slice(nextQuote + 1).trim();
            if (afterQuote.startsWith(",") || afterQuote.startsWith("}") || afterQuote.startsWith("]")) {
              valueEndIndex = nextQuote;
              break;
            }
            tempIndex = nextQuote + 1;
          }
          
          if (valueEndIndex !== -1) {
            let val = cleaned.slice(startIndex, valueEndIndex);
            // Escape any unescaped double quotes within the value string
            val = val.replace(/(?<!\\)"/g, '\\"');
            repairedObj[key] = val;
          }
        }
      }
      
      if (repairedObj.category && repairedObj.proposedName) {
        return repairedObj;
      }
    } catch (err) {
      // Ignore recovery errors and throw original
    }
    throw e;
  }
}
