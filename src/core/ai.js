import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const OLLAMA_URL = "http://localhost:11434/api/chat";
const OLLAMA_MODEL = "gemma"; // Assuming the user pulled 'gemma' or 'gemma:4b' or 'gemma:7b'. We will use 'gemma' as the default tag.

export async function initAI(mock = false) {
  if (mock) {
    console.log("Initializing AI in MOCK mode.");
    return;
  }
  
  try {
    // Ping Ollama to see if it's running
    const response = await fetch("http://localhost:11434/api/tags");
    if (!response.ok) {
      throw new Error(`Ollama responded with status: ${response.status}`);
    }
    const data = await response.json();
    const models = data.models.map(m => m.name);
    console.log(`Connected to Ollama. Available models: ${models.join(", ")}`);
    
    if (!models.some(m => m.includes("gemma"))) {
      console.warn("Warning: 'gemma' model not found in Ollama. Make sure to run `ollama run gemma`.");
    }
  } catch (error) {
    console.error("Failed to connect to Ollama. Please ensure Ollama is running at http://localhost:11434");
    console.error(error.message);
  }
}

export async function askAI(prompt, systemPrompt = "You are a helpful file organization AI. You must respond in valid JSON format.") {
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
    console.error("AI Error:", error);
    return JSON.stringify({ error: "Failed to generate AI response." });
  }
}
