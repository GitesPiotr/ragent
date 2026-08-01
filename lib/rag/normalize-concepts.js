// Normalizacja pojęć (Sesja 8) — scalanie duplikatów w pojęcia kanoniczne.
// Czysty JS, do bazy wyłącznie przez db.js. Zero React/Next/window.
//
// Algorytm jest zaimplementowany DOKŁADNIE wg SPEC (punkty 1–7). Jedyne, co jest
// wymienne, to FUNKCJA PODOBIEŃSTWA — patrz `czyScalic` niżej.
//
// =============================================================================
//  ROZPOZNANA PRZYCZYNA, DLA KTÓREJ SAM PRÓG NIE WYSTARCZA
//
//  Sesja 8 była projektowana pod WARIANTY FLEKSYJNE („urlop"/„urlopy"/„Urlop").
//  Sesja 7 produkuje natomiast FRAZY SEMANTYCZNIE ROZSZERZONE — „prawo do urlopu",
//  „wymiar urlopu", „coroczny urlop". Te naprawdę leżą dalej i bge-m3 ma rację:
//  „wymiar urlopu" nie jest inną formą „urlopu", tylko innym pojęciem.
//
//  Zmierzone na 18 pojęciach z 01-regulamin-pracy.md:
//     0,8911  „urlop wypoczynkowy" ↔ „urlop"   ← jedyna para nad progiem 0,88
//     0,8311  „wymiar urlopu"      ↔ „urlop"
//     0,8281  „prawo do urlopu"    ↔ „urlop"
//     0,7868  „przedłużony urlop"  ↔ „urlop"
//     0,7483  „coroczny urlop"     ↔ „urlop"
//  Im więcej fraza niesie ponad rdzeń, tym dalej leży od rdzenia. STROJENIE PROGU
//  TEGO NIE NAPRAWI — problem nie leży w granicy, tylko w tym, że sygnał wektorowy
//  nie zawiera informacji „to jest ta sama rzecz, tylko doprecyzowana".
//  Zejście do 0,70 skleja rodzinę, ale zaczyna zgarniać rzeczy niepowiązane.
//
//  To ten sam wzorzec co przy identyfikatorach w Sesji 5 (11.1): żaden próg nie
//  rozdziela klas, bo sygnał nie zawiera potrzebnej informacji. Odpowiedzią jest
//  DRUGI SYGNAŁ, nie przesuwanie granicy.
// =============================================================================

import { getSupabaseClient, czytajStronami } from './db.js';
import { getConfig } from './config.js';

function err(code, message) {
  const e = new Error(message);
  e.code = code;
  return e;
}

// =============================================================================
//  CZY SCALANIE CZEKA NA URUCHOMIENIE
//
//  JEDNO MIEJSCE, DWA WIDOKI. Regułę czyta i graf, i widok kolekcji. Skopiowana
//  rozjechałaby się przy pierwszej zmianie i dwa ekrany mówiłyby co innego o tym
//  samym stanie — a to jest dokładnie ten rodzaj usterki, którą ten stan ma wykrywać.
//
//  Pojęcie utworzone PÓŹNIEJ niż ostatni przebieg normalizacji nie było jeszcze
//  z niczym porównywane. `concepts_normalized_at = NULL` znaczy „nigdy nie
//  normalizowano" i MA BYĆ nieodróżnialne od „nie przeszła": obie sytuacje wymagają
//  tego samego działania, a milczenie byłoby gorsze niż fałszywy alarm.
//
//  Kolekcja bez pojęć zwraca false — nie ma czego scalać.
// =============================================================================
export async function czyNormalizacjaOczekuje(collectionId, deps = {}) {
  const client = deps.client || getSupabaseClient();

  const { count: ilePojec } = await client
    .from('rag_concepts')
    .select('id', { count: 'exact', head: true })
    .eq('collection_id', collectionId);
  if (!ilePojec) return false;

  // Znacznik wolno podać z zewnątrz, gdy wołający i tak ma już wiersz kolekcji —
  // bez tego graf robiłby drugi odczyt tego samego pola.
  let znacznik = deps.concepts_normalized_at;
  if (znacznik === undefined) {
    const { data, error } = await client
      .from('rag_collections')
      .select('concepts_normalized_at')
      .eq('id', collectionId)
      .single();
    if (error && /concepts_normalized_at/.test(error.message || '')) {
      throw err(
        'invalid_input',
        'Brak kolumny rag_collections.concepts_normalized_at. Uruchom ręcznie skrypt sql/session-normalizacja-znacznik.sql w Supabase → SQL Editor.'
      );
    }
    znacznik = data ? data.concepts_normalized_at : null;
  }
  if (!znacznik) return true;

  const { count } = await client
    .from('rag_concepts')
    .select('id', { count: 'exact', head: true })
    .eq('collection_id', collectionId)
    .gt('created_at', znacznik);
  return (count || 0) > 0;
}

export function cosinus(a, b) {
  let s = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { s += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  const m = Math.sqrt(na * nb);
  return m === 0 ? 0 : s / m;
}

// =============================================================================
//  DRUGI SYGNAŁ — NAKŁADANIE LEKSYKALNE
//
//  Dwie etykiety dzielą rdzeń, gdy istnieje para wyrazów o wspólnym przedrostku
//  długości >= n, przy czym OBA wyrazy mają co najmniej n liter. Bez tego drugiego
//  warunku krótki wyraz „zawierałby się" w każdym dłuższym o tym samym początku.
//
//  Zmierzone na 153 parach z regulaminu:
//     ze wspólnym rdzeniem ≥5 liter:  21 par, średnia 0,7790, MAKS 0,9287
//     bez wspólnego rdzenia:         132 pary, średnia 0,5329, MAKS 0,7200
//  Żadna para BEZ wspólnego rdzenia nie przekracza 0,7200 — to jest ta separacja,
//  której sam próg nie ma.
// =============================================================================
function wspolnyPrefiks(a, b) {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return i;
}

export function dzielaRdzen(labelA, labelB, n) {
  const wa = (String(labelA || '').match(/\p{L}{2,}/gu) || []).map((x) => x.toLowerCase());
  const wb = (String(labelB || '').match(/\p{L}{2,}/gu) || []).map((x) => x.toLowerCase());
  for (const x of wa) {
    for (const y of wb) {
      if (x.length >= n && y.length >= n && wspolnyPrefiks(x, y) >= n) return true;
    }
  }
  return false;
}

// WYMIENIALNA FUNKCJA PODOBIEŃSTWA. Domyślnie: sam próg wektorowy, czyli
// zachowanie dokładnie ze SPEC. Z `mergeLexical` włączonym dochodzi drugi sygnał.
//
// NAKŁADANIE JEST WARUNKIEM DODATKOWYM, NIGDY ZASTĘPCZYM. „praca"/„pracownik"
// i „prawo"/„prawodawca" dzielą przedrostek, a to różne pojęcia — sam wspólny
// rdzeń nie może niczego scalić.
export function czyScalic(cos, labelA, labelB, cfg) {
  if (cos >= cfg.mergeThreshold) return true;
  if (!cfg.mergeLexical) return false;
  return cos >= cfg.mergeLexicalMin && dzielaRdzen(labelA, labelB, cfg.stemMin);
}

// =============================================================================
//  GRUPOWANIE (SPEC, punkt 2) — czysta funkcja, testowalna bez bazy
//
//  pojecia: [{ id, label, labelNormalized, mentionCount, wek, jestZiarnem }]
// =============================================================================
export function grupuj(pojecia, cfg) {
  // PIERWSZEŃSTWO ZIAREN: pojęcia już kanoniczne dla kogokolwiek zostają ziarnami
  // niezależnie od mention_count. Bez tego ponowne uruchomienie po dołożeniu
  // dokumentów tworzy ŁAŃCUCHY: jeśli „urlop" jest kanoniczne dla „urlopy", a nowe
  // „dni wolne" uzbiera wyższy mention_count, stałoby się ziarnem i wchłonęło
  // „urlop" — powstałby łańcuch „urlopy" → „urlop" → „dni wolne".
  const posort = [...pojecia].sort((a, b) => {
    if (a.jestZiarnem !== b.jestZiarnem) return a.jestZiarnem ? -1 : 1;
    const m = (b.mentionCount || 0) - (a.mentionCount || 0);
    if (m !== 0) return m;
    return String(a.labelNormalized).localeCompare(String(b.labelNormalized));
  });

  const przypisane = new Set();
  const grupy = [];

  for (const ziarno of posort) {
    if (przypisane.has(ziarno.id)) continue;
    przypisane.add(ziarno.id);
    const czlonkowie = [];
    for (const kandydat of posort) {
      if (przypisane.has(kandydat.id)) continue;
      // Podobieństwo liczone DO ZIARNA, nie między kandydatami. Porównania parami
      // dają błędną przechodniość: „urlop"≈„urlopy" i „urlopy"≈„dni wolne" NIE
      // znaczy „urlop"≈„dni wolne".
      const s = cosinus(ziarno.wek, kandydat.wek);
      if (czyScalic(s, ziarno.label, kandydat.label, cfg)) {
        przypisane.add(kandydat.id);
        czlonkowie.push(kandydat);
      }
    }
    grupy.push({ ziarno, czlonkowie });
  }
  return grupy;
}

// =============================================================================
//  normalizeConcepts (sekcja 9)
// =============================================================================
export async function normalizeConcepts(collectionId, deps = {}) {
  if (!collectionId) throw err('invalid_input', 'Brak identyfikatora kolekcji.');
  const config = getConfig();
  const client = deps.client || getSupabaseClient();
  const cfg = {
    mergeThreshold: config.concept.mergeThreshold,
    mergeLexical: config.concept.mergeLexical,
    mergeLexicalMin: config.concept.mergeLexicalMin,
    stemMin: config.concept.stemMin,
  };

  // STRONAMI — 565 pojęć po Kodeksie. Ucięcie na 1000 byłoby tu najgroźniejsze
  // z wszystkich: normalizacja porównuje KAŻDĄ parę, więc czytając część danych
  // po cichu przestałaby scalać duplikaty, których nie zobaczyła.
  const surowe = await czytajStronami(
    (od, do_) =>
      client
        .from('rag_concepts')
        .select('id, label, label_normalized, mention_count, embedding, merged_into')
        .eq('collection_id', collectionId)
        .order('id', { ascending: true })
        .range(od, do_),
    { naBlad: (e) => err('internal', 'Błąd odczytu pojęć: ' + e.message) }
  );

  const wszystkie = surowe || [];

  // PUNKT 6 — IDEMPOTENCJA: pojęcia, które już mają merged_into, są poza grą.
  // Powtórne uruchomienie nie zmienia niczego i nie tworzy łańcuchów.
  const kanoniczne = wszystkie.filter((p) => !p.merged_into);

  // Które z nich są JUŻ ziarnami dla kogokolwiek (punkt 2, pierwszeństwo ziaren).
  const idZiaren = new Set(wszystkie.filter((p) => p.merged_into).map((p) => p.merged_into));

  // PUNKT 1 — ZABEZPIECZENIE: identyczne label_normalized scalamy bezwarunkowo.
  // W praktyce nic nie znajdzie — `unique (collection_id, label_normalized)` na to
  // nie pozwala. Zostawione jako siatka bezpieczeństwa, gdyby ograniczenie kiedyś
  // zniknęło albo dane przyszły z importu z pominięciem aplikacji.
  const wgNormy = new Map();
  const scalenia = [];
  for (const p of kanoniczne) {
    const k = p.label_normalized;
    if (!wgNormy.has(k)) { wgNormy.set(k, p); continue; }
    scalenia.push({ from: p, into: wgNormy.get(k), powod: 'identyczna etykieta' });
  }
  const juzScalone = new Set(scalenia.map((s) => s.from.id));

  // PUNKT 2 — grupowanie wektorowe. Pojęcia bez wektora nie mają jak być
  // porównane; zostają samodzielne, zamiast trafiać do przypadkowej grupy.
  const doGrupowania = kanoniczne
    .filter((p) => !juzScalone.has(p.id) && p.embedding)
    .map((p) => ({
      id: p.id,
      label: p.label,
      labelNormalized: p.label_normalized,
      mentionCount: p.mention_count || 0,
      jestZiarnem: idZiaren.has(p.id),
      wek: typeof p.embedding === 'string' ? JSON.parse(p.embedding) : p.embedding,
    }));

  for (const g of grupuj(doGrupowania, cfg)) {
    for (const c of g.czlonkowie) {
      scalenia.push({
        from: { id: c.id, label: c.label },
        into: { id: g.ziarno.id, label: g.ziarno.label },
        powod: 'podobieństwo wektorowe',
      });
    }
  }

  // --- zapis -----------------------------------------------------------------
  const dotkniete = new Set();
  for (const s of scalenia) {
    // PUNKT 4 — PRZEPIĘCIE POWIĄZAŃ. Klucz główny to (chunk_id, concept_id), więc
    // wstawienie musi tolerować konflikt: fragment mógł być powiązany z OBOMA
    // pojęciami. Dopiero po przepięciu kasujemy stare wiersze.
    const { data: stare } = await client
      .from('rag_chunk_concepts')
      .select('chunk_id')
      .eq('concept_id', s.from.id);

    if (stare && stare.length) {
      const { error: iErr } = await client
        .from('rag_chunk_concepts')
        .upsert(
          stare.map((r) => ({ chunk_id: r.chunk_id, concept_id: s.into.id })),
          { onConflict: 'chunk_id,concept_id', ignoreDuplicates: true }
        );
      if (iErr) throw err('internal', 'Błąd przepinania powiązań: ' + iErr.message);

      const { error: dErr } = await client
        .from('rag_chunk_concepts')
        .delete()
        .eq('concept_id', s.from.id);
      if (dErr) throw err('internal', 'Błąd usuwania starych powiązań: ' + dErr.message);
    }

    // PUNKT 3 — scalone dostaje merged_into; kanoniczne ma ZAWSZE merged_into = null.
    const { error: uErr } = await client
      .from('rag_concepts')
      .update({ merged_into: s.into.id })
      .eq('id', s.from.id);
    if (uErr) throw err('internal', 'Błąd zapisu merged_into: ' + uErr.message);

    dotkniete.add(s.into.id);
  }

  // PUNKT 5 — mention_count kanonicznego.
  //
  // SPEC mówi „suma wartości wszystkich scalonych". Liczymy jednak z count(*)
  // powiązań, tak samo jak w Sesji 7 — i to jest KONTYNUACJA tamtego odejścia,
  // nie nowe. Powód: jeśli fragment był powiązany z „urlop" I z „urlop wypoczynkowy",
  // po przepięciu ma JEDNO powiązanie (klucz główny), a suma powiedziałaby 2.
  // mention_count ma znaczyć „w ilu fragmentach pojęcie wystąpiło" — suma
  // zawyżałaby je dokładnie o współwystąpienia, czyli najczęściej tam, gdzie
  // scalanie zadziałało najlepiej.
  for (const id of dotkniete) {
    const { count } = await client
      .from('rag_chunk_concepts')
      .select('chunk_id', { count: 'exact', head: true })
      .eq('concept_id', id);
    await client.from('rag_concepts').update({ mention_count: count || 0 }).eq('id', id);
  }

  const { count: ile } = await client
    .from('rag_concepts')
    .select('id', { count: 'exact', head: true })
    .eq('collection_id', collectionId)
    .is('merged_into', null);

  // ZNACZNIK PRZEBIEGU. Bez niego widok nie ma jak odróżnić „pojęcia policzone
  // i scalone" od „pojęcia policzone, scalanie pominięte" — a te dwa stany wyglądają
  // identycznie i różnią się o sto niescalonych duplikatów (patrz
  // sql/session-normalizacja-znacznik.sql). Zapisywany ZAWSZE, także gdy nie było
  // ani jednego scalenia: pusty przebieg to też przebieg, i właśnie on jest dowodem,
  // że nie ma czego scalać.
  const { error: zErr } = await client
    .from('rag_collections')
    .update({ concepts_normalized_at: new Date().toISOString() })
    .eq('id', collectionId);
  if (zErr) throw err('internal', 'Błąd zapisu znacznika normalizacji: ' + zErr.message);

  // PUNKT 7 — raport.
  return {
    merged: scalenia.map((s) => ({
      from: s.from.label,
      into: s.into.label,
      powod: s.powod,
    })),
    conceptCount: ile || 0,
  };
}
