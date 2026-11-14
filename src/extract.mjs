import { validateMeeting, LIMITS } from './core.mjs';

function fragments(text, source) {
  const ranges = []; let start = 0;
  for (const match of text.matchAll(/[.!?;,](?:\s+|$)|\n+/gu)) { const end = match.index + match[0].length; ranges.push([start, end]); start = end; }
  if (start < text.length) ranges.push([start, text.length]);
  const units = [];
  for (const [a, b] of ranges) {
    let offset = a;
    while (offset < b) {
      let end = Math.min(offset + 1200, b);
      if (end < b && /[\ud800-\udbff]/u.test(text[end - 1])) end -= 1;
      const raw = text.slice(offset, end), quote = raw.trim(), left = raw.length - raw.trimStart().length;
      if (quote) units.push({ source, start: offset + left, end: offset + left + quote.length, text: quote });
      offset = end;
    }
  }
  return units;
}
function category(text) {
  const folded = text.normalize('NFD').replace(/\p{M}/gu, '');
  if (/\b(no|not|undecided|pending|pendiente|todavia|sin decidir)\b/iu.test(folded)) return 'pending';
  if (/\b(agreed|decided|acordamos|acordado|acordaron|acordo|aprobado|aprobo|decidimos|decidido)\b/iu.test(folded)) return 'decisions';
  if (/\b(will|shall|we['’]ll|debe|debera|revisara|revisaremos|comprobara|comprobaremos|publicara|publicaremos|enviara|enviaremos|preparara|prepararemos)\b/iu.test(folded)) return 'actions';
  return 'other';
}

// Source selection/classification is deterministic. Every excerpt is an exact
// slice; no model-generated prose can add a completed action, owner or date.
export function extractNotes(input) {
  const meeting = validateMeeting(input), spanish = meeting.language === 'spanish';
  const units = [
    ...fragments(meeting.notes, 'notes').map((u, i) => ({ ...u, id: `N${i + 1}`, category: 'personal' })),
    ...fragments(meeting.transcript, 'transcript').map((u, i) => ({ ...u, id: `T${i + 1}`, category: category(u.text) })),
  ];
  if (!units.length) throw new Error('EMPTY_SOURCE');
  const headings = spanish ? { personal: 'Mis notas', decisions: 'Posibles acuerdos', actions: 'Posibles acciones', pending: 'Preguntas y pendientes', other: 'Otros fragmentos' } : { personal: 'Personal notes', decisions: 'Possible decisions', actions: 'Possible actions', pending: 'Questions and pending items', other: 'Other excerpts' };
  const parts = [spanish ? '# Extracto para revisar' : '# Excerpt for review'];
  const selected = []; let budget = LIMITS.summary - 1500;
  for (const key of ['personal', 'decisions', 'actions', 'pending', 'other']) {
    const lines = [];
    for (const unit of units.filter(u => u.category === key)) {
      if (selected.length >= 18 || (key === 'personal' && lines.length >= 6) || (key === 'other' && lines.length >= 6)) break;
      const line = `- [${unit.id}] ${unit.text}`;
      if (line.length > budget) continue;
      budget -= line.length; lines.push(line); selected.push(unit);
    }
    if (lines.length) parts.push(`## ${headings[key]}`, lines.join('\n'));
  }
  const omitted = units.length - selected.length;
  parts.push(spanish ? `${selected.length} de ${units.length} fragmentos. Clasificación por reglas; revisa el contexto. La fuente completa se conserva en Mis notas y Transcripción.` : `${selected.length} of ${units.length} excerpts. Rule-based grouping; review the context. The complete source remains in Personal notes and Transcript.`);
  const text = parts.join('\n\n');
  if (text.length > LIMITS.summary) throw new Error('EXCERPT_LIMIT');
  return { text, meta: { method: 'source-extract-v1', sourceCharacters: meeting.notes.length + meeting.transcript.length, selectedCharacters: selected.reduce((n, u) => n + u.text.length, 0), totalUnits: units.length, selectedCount: selected.length, omittedCount: omitted, complete: omitted === 0, units: selected } };
}
