// eval/lib/markdown-parse.mjs
//
// PURE parsers that turn a live Codex agent's free-text Markdown workpaper into
// the structured signals the scorer needs. No I/O — importable by node and tsx,
// fully covered by scripts/eval-scoring.test.mjs.
//
// HONESTY NOTES:
//   - If a figure is not clearly stated near its label, we return null. A number
//     we cannot confidently read is NEVER credited (null -> "not within tolerance").
//   - We take the FIRST labeled occurrence near a keyword, not "the closest to
//     the expected answer" — the scorer must not be able to hunt for a flattering
//     match.
//   - Money/percent/ratio parsing is deliberately conservative.

// --- scalar parsers ---------------------------------------------------------

// "$1,234,567" | "1,234,000" | "$1.2M" | "$1.2 million" | "1.2mm" -> Number | null
export function parseMoney(raw) {
  if (typeof raw !== 'string') return null;
  const s = raw.replace(/[, ]/g, '').toLowerCase();
  const m = s.match(/\$?(-?\d+(?:\.\d+)?)(mm|m|million|k|thousand)?/);
  if (!m) return null;
  let value = Number(m[1]);
  if (!Number.isFinite(value)) return null;
  const suffix = m[2];
  if (suffix === 'm' || suffix === 'mm' || suffix === 'million') value *= 1_000_000;
  else if (suffix === 'k' || suffix === 'thousand') value *= 1_000;
  return value;
}

// "6.18%" | "6.18 percent" | "0.0618" (decimal) -> decimal Number | null
export function parsePercent(raw) {
  if (typeof raw !== 'string') return null;
  const s = raw.trim().toLowerCase();
  const pctMatch = s.match(/(-?\d+(?:\.\d+)?)\s*(%|percent)/);
  if (pctMatch) {
    const v = Number(pctMatch[1]);
    return Number.isFinite(v) ? v / 100 : null;
  }
  const bare = s.match(/^-?\d+(?:\.\d+)?$/);
  if (bare) {
    const v = Number(s);
    if (!Number.isFinite(v)) return null;
    // A value > 1 is almost certainly a percent written without the sign
    // (e.g. "6.18" meaning 6.18%); <= 1 is already a decimal rate.
    return v > 1 ? v / 100 : v;
  }
  return null;
}

// "1.13x" | "1.13" -> Number | null
export function parseRatio(raw) {
  if (typeof raw !== 'string') return null;
  const m = raw.replace(/,/g, '').match(/(-?\d+(?:\.\d+)?)\s*[x×]?/i);
  if (!m) return null;
  const v = Number(m[1]);
  return Number.isFinite(v) ? v : null;
}

// --- section splitting ------------------------------------------------------

// Splits a workpaper into its "## Heading" sections. Returns a Map of
// lowercased-heading -> body text. Robust to extra whitespace / casing.
export function splitSections(markdown) {
  const out = new Map();
  if (typeof markdown !== 'string') return out;
  const lines = markdown.split(/\r?\n/);
  let current = null;
  let buf = [];
  const flush = () => {
    if (current !== null) out.set(current, buf.join('\n').trim());
  };
  for (const line of lines) {
    const h = line.match(/^\s*#{1,6}\s+(.*?)\s*#*\s*$/);
    if (h) {
      flush();
      current = h[1].trim().toLowerCase();
      buf = [];
    } else if (current !== null) {
      buf.push(line);
    }
  }
  flush();
  return out;
}

// Returns the body of the first section whose heading includes any of `names`.
function sectionBody(sections, names) {
  for (const [heading, body] of sections.entries()) {
    if (names.some((n) => heading.includes(n))) return body;
  }
  return null;
}

// --- field extractors -------------------------------------------------------

// Finds the first numeric token of `kind` ("money"|"percent"|"ratio") that
// appears within `window` chars AFTER any of the keyword regexes.
// A number, optionally with thousands separators / decimals.
const NUM = String.raw`\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?`;
// Optional qualifier words that may sit between the number and its label. The
// inter-word whitespace is HORIZONTAL-only ([^\S\n]) so a value on one line can
// never bind to a label on the next (in a one-metric-per-line "## Metrics" block
// that would otherwise read line N's value as line N+1's metric).
const QUAL = String.raw`(?:going-in[^\S\n]+|going in[^\S\n]+|current[^\S\n]+|stabilized[^\S\n]+|levered[^\S\n]+|leveraged[^\S\n]+|in-place[^\S\n]+|in place[^\S\n]+|year[ -]?1[^\S\n]+|base[^\S\n]+|amorti[sz]ing[^\S\n]+|amorti[sz]ed[^\S\n]+)?`;
// Optional connector words between a label and its number ("DSCR of 1.13x").
const CONN = String.raw`(?:[^\S\n]*(?:of about|of|is|are|at|=|:|~|about|approximately|projected at|implies an?|implied|around|near|of roughly|roughly)?[^\S\n]*(?:about[^\S\n]+|approximately[^\S\n]+|roughly[^\S\n]+|~[^\S\n]*)?)`;

// Finds a metric value by its label, requiring the value to carry the metric's
// UNIT so we never grab a neighbouring context number (a scenario count, a hold
// period, an unrelated rate). Searches BOTH "<value> <label>" (e.g. "1.13x
// DSCR") and "<label> ... <value>" (e.g. "DSCR of 1.13x") and returns the value
// from whichever full match occurs EARLIEST in the text.
//   kind: 'pct'  -> value must end in %   (cap rate, IRR)
//         'mult' -> value must end in x   (DSCR, equity multiple)
//         'money'-> value must carry $ or a magnitude word (NOI, EGI)
// Returns a parsed Number, or null when the labelled+unit-qualified value is
// absent (an unstated metric is NEVER invented).
// A value stated as a requirement/target/minimum is NOT the deal's computed
// metric. If one of these words sits just before the match, reject it — the
// honest read is "the agent did not compute this metric" (null), not the
// threshold it was compared against. (Real case: scenario-analyst wrote "the
// repo threshold requires 1.25x DSCR, 15% IRR, 1.8x equity multiple" — those are
// thresholds, and the agent explicitly could not compute the deal's IRR/EM.)
const THRESHOLD_RE = /\b(?:threshold|require[sd]?|minimum|maximum|\bmin\b|target|hurdle|at least|underwriting (?:minimum|standard|threshold|target)|must (?:be|exceed|clear)|pass(?:ing)? bar)\b/i;

// Disqualifying qualifiers for the GOING-IN determinable metrics (NOI, EGI, cap
// rate, DSCR). The ground truth defines these as the going-in / in-place figures,
// so a value labelled pro-forma / stabilized / projected / exit / reversion /
// stressed / scenario / interest-only is NOT the metric we want. If one of these
// sits next to the matched label, skip the candidate (the going-in value stated
// elsewhere wins). NOT applied to IRR / equity multiple, which are inherently
// projected returns with no going-in vs. pro-forma distinction.
const GOING_IN_DISQUALIFIER_RE = /\b(?:pro[\s-]?forma|proforma|stabili[sz]ed|projected|forecast(?:ed)?|exit|reversion|terminal|year[\s-]?[2-9]|yr[\s-]?[2-9]|stressed|scenario|downside|upside|interest[\s-]?only)\b/i;

function findMetric(text, labelAlt, kind, goingIn = false) {
  if (typeof text !== 'string' || text.length === 0) return null;
  let valTok;
  // All inter-token whitespace is HORIZONTAL-only ([^\S\n]) so a value never
  // spans a line break to bind to a label on the next line (the one-metric-per-
  // line "## Metrics" block would otherwise read line N's value as line N+1's
  // metric — e.g. "$960,000\nEGI:" read as EGI).
  // A leading "-" attached to the number is captured so negative returns survive
  // (a distressed deal's "Leveraged IRR: -99.0%" / "Equity Multiple: -2.38x" must
  // NOT be read as +99% / +2.38x). The minus must abut the digit, so a dash used
  // as a separator ("IRR - 12%") is not mistaken for a negative. NUM is wrapped in
  // (?:...) because its top-level alternation would otherwise leak past the sign.
  if (kind === 'pct') valTok = String.raw`(-?(?:${NUM}))[^\S\n]*%`;
  else if (kind === 'mult') valTok = String.raw`(-?(?:${NUM}))[^\S\n]*[x×]`;
  // NUM contains a top-level alternation, so it MUST be wrapped in (?:...) when
  // embedded in a larger alternation — otherwise its `|` leaks and breaks the
  // surrounding branches (this silently dropped the "$" money branch once).
  else valTok = String.raw`(\$[^\S\n]?(?:${NUM})[^\S\n]*(?:mm|bn|b|m|million|k|thousand)?|(?:${NUM})[^\S\n]*(?:mm|bn|b|m|million|k|thousand))`;

  const beforeRe = new RegExp(`${valTok}[^\\S\\n]*${QUAL}(?:${labelAlt})`, 'gi');
  // Allow one parenthetical basis/qualifier between the label and its value
  // ("Going-in DSCR (amortizing): 1.31x"). The qualifier text stays inside the
  // matched span, so the disqualifier check still sees e.g. "(interest-only)".
  const afterRe = new RegExp(`(?:${labelAlt})(?:[^\\S\\n]*\\([^)\\n]*\\))?${CONN}${valTok}`, 'gi');

  // Collect every full match from both directions, then take the earliest one
  // that is NOT in a threshold/requirement context.
  const candidates = [];
  for (const re of [beforeRe, afterRe]) {
    let m;
    while ((m = re.exec(text)) !== null) {
      candidates.push({ index: m.index, end: m.index + m[0].length, cap: m[1] });
      if (m.index === re.lastIndex) re.lastIndex++; // guard against any zero-length loop
    }
  }
  candidates.sort((a, b) => a.index - b.index);
  for (const c of candidates) {
    // Look back for threshold words, but only within the SAME line — never
    // borrow a word like "floor"/"requires" from an adjacent bullet.
    const lineStart = text.lastIndexOf('\n', c.index - 1) + 1;
    const ctx = text.slice(Math.max(lineStart, c.index - 60), c.end);
    if (THRESHOLD_RE.test(ctx)) continue; // a requirement/target, not the metric
    if (goingIn && GOING_IN_DISQUALIFIER_RE.test(ctx)) continue; // pro-forma/exit/etc., not the going-in figure
    if (kind === 'pct') return parsePercent(c.cap + '%');
    if (kind === 'mult') return parseRatio(c.cap);
    return parseMoney(c.cap);
  }
  return null;
}

// Extracts { noi, egi, capRate, dscr, irr, equityMultiple } from a workpaper.
// Any metric not stated with its proper unit is null (no invented numbers).
export function parseFinancials(markdown) {
  const text = typeof markdown === 'string' ? markdown : '';
  return {
    noi: findMetric(text, 'net operating income|noi', 'money', true),
    egi: findMetric(text, 'effective gross income|egi', 'money', true),
    capRate: findMetric(text, 'cap(?:italization)?[ -]?rate', 'pct', true),
    dscr: findMetric(text, 'dscr|debt[ -]service[ -]coverage(?: ratio)?', 'mult', true),
    irr: findMetric(text, 'leveraged irr|levered irr|irr|internal rate of return', 'pct'),
    equityMultiple: findMetric(text, 'equity[ -]multiple|equity[ -]multiplier|moic', 'mult')
  };
}

// Pulls the PASS|CONDITIONAL|FAIL token from the "## Agent Verdict" section
// (falls back to whole text). Mirrors codex-agent-runner's extractAgentVerdict.
export function parseVerdict(markdown) {
  const sections = splitSections(markdown);
  const body = sectionBody(sections, ['agent verdict', 'verdict', 'recommendation']);
  const haystack = body !== null ? body : typeof markdown === 'string' ? markdown : '';
  const m = haystack.match(/\b(PASS|CONDITIONAL|FAIL)\b/i);
  return m ? m[1].toUpperCase() : 'UNKNOWN';
}

// Collects flag/finding text for keyword matching by the scorer. Pulls the
// Red Flags, Data Gaps, Key Findings and Agent Verdict sections (where a
// competent agent would name a risk), one entry per non-empty line. Falls back
// to the whole document if sections are absent.
export function parseFlagTexts(markdown) {
  if (typeof markdown !== 'string' || markdown.length === 0) return [];
  const sections = splitSections(markdown);
  const wanted = ['red flag', 'data gap', 'key finding', 'agent verdict', 'recommended follow'];
  const texts = [];
  let foundAny = false;
  for (const [heading, body] of sections.entries()) {
    if (!wanted.some((w) => heading.includes(w))) continue;
    foundAny = true;
    for (const line of body.split(/\r?\n/)) {
      const cleaned = line.replace(/^[\s*\-•\d.]+/, '').trim();
      if (cleaned) texts.push(cleaned);
    }
  }
  if (!foundAny) {
    for (const line of markdown.split(/\r?\n/)) {
      const cleaned = line.replace(/^[\s*\-•\d.#]+/, '').trim();
      if (cleaned) texts.push(cleaned);
    }
  }
  return texts;
}
