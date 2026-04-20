export const RALPHA_EXPLICIT_TOKENS = Object.freeze(new Map([
  ['$ralpha', 'ralpha'],
]));

export const WELL_SPECIFIED_SIGNALS = [
  /\b[\w/.-]+\.(?:ts|js|py|go|rs|java|tsx|jsx|md|json|yaml|yml|toml)\b/,
  /(?:src|lib|test|spec|app|pages|components|hooks|utils|services|api|dist|build|scripts)\/\w+/,
  /\b[a-z]+(?:[A-Z][a-z]+)+\b/,
  /\b[A-Z][a-z]+(?:[A-Z][a-z0-9]*)+\b/,
  /\b[a-z]+(?:_[a-z]+)+\b/,
  /(?:^|\s)#\d+\b/,
  /(?:^|\n)\s*(?:\d+[.)]\s|-\s+\S|\*\s+\S)/m,
  /\b(?:acceptance\s+criteria|test\s+(?:spec|plan|case)|should\s+(?:return|throw|render|display|create|delete|update))\b/i,
  /\b(?:error:|bug\s*#?\d+|issue\s*#\d+|stack\s*trace|exception|TypeError|ReferenceError|SyntaxError)\b/i,
  /```[\s\S]{20,}?```/,
  /\bin\s+[\w/.-]+\.(?:ts|js|py|go|rs|java|tsx|jsx)\b/,
];


export function detectExplicitTrigger(text) {
  const matches = text.match(/(?:^|[^\w])\$([a-z][a-z0-9-]*)\b/i);
  if (!matches) return null;
  const token = `$${matches[1].toLowerCase()}`;
  const skill = RALPHA_EXPLICIT_TOKENS.get(token);
  if (!skill) return null;
  return { keyword: token, skill, priority: 8 };
}

export function detectImplicitTrigger(text) {
  return null;
}

export function detectKeywords(text) {
  const explicit = detectExplicitTrigger(text);
  if (explicit) return [explicit];
  const implicit = detectImplicitTrigger(text);
  return implicit ? [implicit] : [];
}

export function detectPrimaryKeyword(text) {
  return detectKeywords(text)[0] ?? null;
}

export function detectRalpha(text) {
  return detectPrimaryKeyword(text);
}

export function isUnderspecifiedForExecution(text) {
  const trimmed = text.trim();
  if (!trimmed) return true;
  if (trimmed.startsWith('force:') || trimmed.startsWith('!')) return false;
  if (WELL_SPECIFIED_SIGNALS.some((pattern) => pattern.test(trimmed))) return false;

  const stripped = trimmed
    .replace(/(?:^|[^\w])\$ralpha\b/gi, ' ')
    .replace(/(?<![A-Za-z0-9-])ralpha(?![A-Za-z0-9-])/gi, ' ')
    .trim();
  const effectiveWords = stripped.split(/\s+/).filter(Boolean).length;
  return effectiveWords <= 15;
}
