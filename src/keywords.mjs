export const OH_MY_RALPHA_TRIGGER_PHRASES = Object.freeze([
  'oh-my-ralpha',
  'ralpha',
  '继续推进',
  '继续完成',
  '继续处理',
  'keep moving',
  'finish the remaining work',
  '收掉 todo',
]);

export const OH_MY_RALPHA_EXPLICIT_TOKENS = Object.freeze(new Map([
  ['$oh-my-ralpha', 'oh-my-ralpha'],
  ['$ralpha', 'oh-my-ralpha'],
]));

export const EXECUTION_GATE_KEYWORDS = new Set([
  'oh-my-ralpha',
]);

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

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function keywordPattern(keyword) {
  const hasAscii = /[A-Za-z0-9]/.test(keyword);
  if (!hasAscii) {
    return new RegExp(escapeRegex(keyword), 'i');
  }
  return new RegExp(`\\b${escapeRegex(keyword)}\\b`, 'i');
}

export function detectExplicitTrigger(text) {
  const matches = text.match(/(?:^|[^\w])\$([a-z][a-z0-9-]*)\b/i);
  if (!matches) return null;
  const token = `$${matches[1].toLowerCase()}`;
  const skill = OH_MY_RALPHA_EXPLICIT_TOKENS.get(token);
  if (!skill) return null;
  return { keyword: token, skill, priority: 8 };
}

export function detectImplicitTrigger(text) {
  for (const phrase of OH_MY_RALPHA_TRIGGER_PHRASES) {
    if (keywordPattern(phrase).test(text)) {
      return { keyword: phrase, skill: 'oh-my-ralpha', priority: 8 };
    }
  }
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

export function detectOhMyRalpha(text) {
  return detectPrimaryKeyword(text);
}

export function isUnderspecifiedForExecution(text) {
  const trimmed = text.trim();
  if (!trimmed) return true;
  if (trimmed.startsWith('force:') || trimmed.startsWith('!')) return false;
  if (WELL_SPECIFIED_SIGNALS.some((pattern) => pattern.test(trimmed))) return false;

  const stripped = trimmed
    .replace(/\b(?:oh-my-ralpha|ralpha)\b/gi, '')
    .trim();
  const effectiveWords = stripped.split(/\s+/).filter(Boolean).length;
  return effectiveWords <= 15;
}
