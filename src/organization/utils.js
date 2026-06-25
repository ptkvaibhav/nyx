export function cleanJSON(str) {
  try {
    const match = str.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (match) return match[1].trim();
    return str.trim();
  } catch {
    return str;
  }
}
