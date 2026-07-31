// Chunker wg sekcji 8.2–8.5 SPEC. "Implementuj dokładnie tak" — ten kod pojedzie do
// drugiego projektu i wpływa wprost na trafność. Czysty JS, bez React/Next/window.
//
// ZASADA NADRZĘDNA (niezmiennik 8.4): content KAŻDEGO fragmentu jest dosłownym wycinkiem
// extracted_text — dlatego chunker operuje na OFFSETACH w extracted_text, a content
// ustawia jako slice(char_start, char_end). Dzięki temu niezmiennik jest gwarantowany
// przez konstrukcję, a nie przez zbieżność dwóch osobnych sklejeń.

const HEADING_SEP = ' › ';

function trimEdges(text) {
  return String(text || '').replace(/^\s+|\s+$/g, '');
}

// extracted_text = wszystkie bloki (łącznie z nagłówkami) połączone DOKŁADNIE "\n\n",
// każdy blok z przyciętymi brzegami (8.4). Zwraca też offsety każdego bloku.
export function buildExtractedText(inputBlocks) {
  const norm = [];
  for (const b of inputBlocks) {
    const text = trimEdges(b.text);
    if (!text) continue; // pusty blok po trim pomijamy
    norm.push({ type: b.type, level: b.level, page: b.page ?? null, text });
  }
  let extractedText = '';
  const blocks = [];
  for (let i = 0; i < norm.length; i++) {
    if (i > 0) extractedText += '\n\n';
    const start = extractedText.length;
    extractedText += norm[i].text;
    blocks.push({ ...norm[i], start, end: extractedText.length });
  }
  return { extractedText, blocks };
}

// Dzieli tekst regionu [start,end) na zdania (.!? + biały znak). Zwraca lokalne
// spany tilujące region w całości (każdy znak należy do dokładnie jednego zdania).
function sentenceTile(region) {
  const spans = [];
  const re = /[.!?]+\s+/g;
  let last = 0;
  let m;
  while ((m = re.exec(region)) !== null) {
    const end = m.index + m[0].length;
    spans.push([last, end]);
    last = end;
  }
  if (last < region.length) spans.push([last, region.length]);
  if (spans.length === 0) spans.push([0, region.length]);
  return spans;
}

// 8.3.4: blok > MAX → tnij po zdaniach do SIZE; pojedyncze zdanie > MAX → twardo co SIZE.
function sentenceSplitSpans(text, start, end, size, max) {
  const region = text.slice(start, end);
  const sentences = sentenceTile(region);
  const spans = [];
  let cur = null;
  for (const [ls, le] of sentences) {
    if (le - ls > max) {
      if (cur) { spans.push(cur); cur = null; }
      for (let p = ls; p < le; p += size) {
        spans.push({ start: start + p, end: start + Math.min(le, p + size) });
      }
      continue;
    }
    if (!cur) {
      cur = { start: start + ls, end: start + le };
    } else if (start + le - cur.start > size) {
      spans.push(cur);
      cur = { start: start + ls, end: start + le };
    } else {
      cur.end = start + le;
    }
  }
  if (cur) spans.push(cur);
  return spans;
}

// 8.3.1–8.3.4: akumuluj bloki dopóki długość ≤ SIZE; przekroczenie → zamknij PRZED
// blokiem; blok > MAX → tnij po zdaniach. Wszystko w offsetach extracted_text.
function buildPrimarySpans(runBlockIdx, blocks, text, size, max) {
  const spans = [];
  let cur = null;
  for (const idx of runBlockIdx) {
    const b = blocks[idx];
    if (b.end - b.start > max) {
      if (cur) { spans.push(cur); cur = null; }
      for (const s of sentenceSplitSpans(text, b.start, b.end, size, max)) spans.push(s);
      continue;
    }
    if (!cur) {
      cur = { start: b.start, end: b.end };
    } else if (b.end - cur.start > size) {
      spans.push(cur);
      cur = { start: b.start, end: b.end };
    } else {
      cur.end = b.end;
    }
  }
  if (cur) spans.push(cur);
  return spans;
}

// 8.3.6: fragment < MIN scal z sąsiadem — WYŁĄCZNIE w obrębie run (nigdy przez nagłówek).
// Krótki scala się z poprzednim; jeśli pierwszy — z następnym. Jeśli run ma jeden span
// i jest krótki (nagłówki po obu stronach), zostaje krótki.
function mergeMinSpans(spans, min) {
  const out = [];
  for (const s of spans) {
    out.push({ start: s.start, end: s.end });
    while (out.length >= 2 && out[out.length - 1].end - out[out.length - 1].start < min) {
      const last = out.pop();
      out[out.length - 1].end = last.end;
    }
  }
  if (out.length >= 2 && out[0].end - out[0].start < min) {
    out[1].start = out[0].start;
    out.shift();
  }
  return out;
}

// Szuka początku zdania (pozycji tuż po granicy .!?\s+) w [from, limit]. Brak → -1.
function sentenceStartInRange(text, from, limit) {
  const re = /[.!?]+\s+/g;
  re.lastIndex = Math.max(0, from - 3);
  let m;
  while ((m = re.exec(text)) !== null) {
    const pos = m.index + m[0].length;
    if (pos > limit) break;
    if (pos >= from) return pos;
  }
  return -1;
}

// 8.3.5: zakładka OVERLAP znaków przycięta WSTECZ do granicy zdania; nie przechodzi
// przez nagłówek (spany są w obrębie jednego run, więc to zapewnione).
function applyOverlap(spans, text, overlap) {
  if (overlap <= 0) return spans.map((s) => ({ start: s.start, end: s.end }));
  const out = [];
  for (let i = 0; i < spans.length; i++) {
    if (i === 0) {
      out.push({ start: spans[i].start, end: spans[i].end });
      continue;
    }
    const prevEnd = spans[i - 1].end;
    const cand = Math.max(0, prevEnd - overlap);
    const boundary = sentenceStartInRange(text, cand, prevEnd);
    // Overlap tylko gdy znaleziono granicę zdania w oknie; inaczej bez zakładki.
    const start = boundary >= 0 && boundary < spans[i].start ? boundary : spans[i].start;
    out.push({ start, end: spans[i].end });
  }
  return out;
}

// page_from/page_to z bloków przecinających zakres (docx → null).
function pagesForRange(blocks, start, end) {
  let pageFrom = null;
  let pageTo = null;
  let seen = false;
  for (const b of blocks) {
    if (b.type === 'heading') continue;
    if (b.start < end && b.end > start) {
      if (!seen) { pageFrom = b.page ?? null; seen = true; }
      pageTo = b.page ?? null;
    }
  }
  return { pageFrom, pageTo };
}

// Główna funkcja: bloki → { extractedText, chunks, blocks }.
// cfg: { size, max, min, overlap } (przekazywane jawnie — chunk.js nie czyta env).
export function chunkBlocks(inputBlocks, cfg) {
  const { size, max, min, overlap } = cfg;
  const { extractedText, blocks } = buildExtractedText(inputBlocks);

  // Grupuj bloki treści w RUNS oddzielone nagłówkami; utrzymuj stos nagłówków (8.2, 8.3.3).
  const stack = [];
  const runs = [];
  let current = null;
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    if (b.type === 'heading') {
      if (current) { runs.push(current); current = null; } // nagłówek zamyka run
      const level = b.level || 1;
      while (stack.length && stack[stack.length - 1].level >= level) stack.pop();
      stack.push({ level, text: b.text });
    } else {
      if (!current) {
        current = { headingPath: stack.map((h) => h.text).join(HEADING_SEP) || null, idx: [] };
      }
      current.idx.push(i);
    }
  }
  if (current) runs.push(current);

  const chunks = [];
  let chunkIndex = 0;
  for (const run of runs) {
    const primary = buildPrimarySpans(run.idx, blocks, extractedText, size, max);
    const merged = mergeMinSpans(primary, min);
    const withOverlap = applyOverlap(merged, extractedText, overlap);
    for (const span of withOverlap) {
      const content = extractedText.slice(span.start, span.end);
      const { pageFrom, pageTo } = pagesForRange(blocks, span.start, span.end);
      chunks.push({
        chunkIndex: chunkIndex++,
        content,
        headingPath: run.headingPath,
        pageFrom,
        pageTo,
        charStart: span.start,
        charEnd: span.end,
        tokenEstimate: Math.round(content.length / 4),
      });
    }
  }

  return { extractedText, chunks, blocks };
}
