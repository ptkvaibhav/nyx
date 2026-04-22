export function matchesAnyRule(relativePath, rules = []) {
  if (!rules.length) {
    return false;
  }

  const normalizedPath = normalizeRulePath(relativePath);
  return rules.some((rule) => globToRegExp(rule).test(normalizedPath));
}

export function isIncluded(relativePath, includeRules = [], excludeRules = []) {
  const normalizedPath = normalizeRulePath(relativePath);

  const included = includeRules.length === 0 || matchesAnyRule(normalizedPath, includeRules);
  const excluded = matchesAnyRule(normalizedPath, excludeRules);

  return included && !excluded;
}

function normalizeRulePath(input) {
  const normalized = input.replaceAll("\\", "/");
  return normalized.startsWith("/") ? normalized : `/${normalized}`;
}

function globToRegExp(rule) {
  const normalizedRule = normalizeRulePath(rule);
  let regexSource = "";

  for (let index = 0; index < normalizedRule.length; index += 1) {
    const current = normalizedRule[index];
    const next = normalizedRule[index + 1];
    const nextNext = normalizedRule[index + 2];

    if (current === "*" && next === "*" && nextNext === "/") {
      regexSource += "(?:.*/)?";
      index += 2;
      continue;
    }

    if (current === "*" && next === "*") {
      regexSource += ".*";
      index += 1;
      continue;
    }

    if (current === "*") {
      regexSource += "[^/]*";
      continue;
    }

    if (/[|\\{}()[\]^$+?.]/.test(current)) {
      regexSource += `\\${current}`;
      continue;
    }

    regexSource += current;
  }

  return new RegExp(`^${regexSource}$`);
}
