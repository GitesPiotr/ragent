// Odpowiedź /api/rag/status → JEDEN werdykt o środowisku.
//
// DLACZEGO TO JEST OSOBNA FUNKCJA, A NIE `if` w komponencie: ten sam werdykt
// pokazują DWA miejsca — dioda przy przycisku „Diagnostyka" w rogu każdej strony
// panelu i nagłówek samej strony diagnostyki. Gdyby każde liczyło po swojemu,
// dałoby się doprowadzić do stanu, w którym dioda świeci zielono, a strona
// pokazuje czerwoną kartę. Kolor w rogu jest OBIETNICĄ, że po kliknięciu zobaczy
// się to samo.
//
// Świadomie bez zależności od Reacta i bez importu z lib/rag/ — tamten katalog
// wciąga konfigurację i klienta bazy, a to ma być czysta funkcja na danych,
// które i tak już przyszły po HTTP.

// TRZY POZIOMY, NIE DWA — i to jest decyzja produktowa, nie uproszczenie.
//
// „Nie mogę indeksować" to inna sytuacja niż „nic nie widzę". Przy zgaszonej
// Ollamie panel działa: kolekcje się otwierają, dokumenty są widoczne, mapa
// i graf się rysują — nie da się tylko dołożyć nowych wektorów ani wyszukać.
// Przy padniętej bazie nie ma nic. Zlanie tego w jedno „coś nie działa" kazałoby
// za każdym razem wchodzić w diagnostykę, żeby sprawdzić którą z tych dwóch
// rzeczy się widzi.
export const POZIOMY = {
  ok: { kolor: '#15803d', etykieta: 'wszystko działa' },
  ostrzezenie: { kolor: '#b45309', etykieta: 'ograniczone działanie' },
  awaria: { kolor: '#b91c1c', etykieta: 'awaria' },
  // CZWARTY STAN: nie ma jeszcze odpowiedzi. Szary, NIGDY zielony — brak pomiaru
  // nie może wyglądać jak pomiar udany. Zielona dioda przez pierwsze pół sekundy
  // po wejściu na stronę byłaby zwykłym kłamstwem: nikt jeszcze niczego nie sprawdził.
  nieznany: { kolor: '#a1a1aa', etykieta: 'sprawdzam…' },
};

// Czy na liście modeli Ollamy jest ten, którym liczymy embeddingi.
// Ollama zwraca nazwy z etykietą wersji („bge-m3:latest"), a konfiguracja trzyma
// zwykle samą nazwę — porównujemy więc człon przed dwukropkiem.
function maModelEmbeddingow(dane) {
  const provider = dane.config && dane.config.embedProvider;
  if (provider !== 'ollama') return true; // inny dostawca — lista modeli Ollamy nic nie mówi
  const szukany = String((dane.config && dane.config.embedModel) || '').split(':')[0];
  if (!szukany) return true;
  const lista = Array.isArray(dane.models) ? dane.models : [];
  return lista.some((m) => String(m && m.name ? m.name : '').split(':')[0] === szukany);
}

// dane: odpowiedź /api/rag/status albo null/undefined (jeszcze nie wróciła).
// blad: komunikat, gdy odpowiedź była kopertą błędu albo fetch się wywrócił.
//
// → { poziom, kolor, etykieta, powod }
//   `powod` idzie do title/aria-label przycisku — sama dioda nie mówi CO jest nie tak,
//   a użytkownik nie ma zgadywać po kolorze.
export function stanSrodowiska(dane, blad = null) {
  if (blad) {
    return { poziom: 'awaria', ...POZIOMY.awaria, powod: 'Diagnostyka niedostępna: ' + blad };
  }
  if (!dane) {
    return { poziom: 'nieznany', ...POZIOMY.nieznany, powod: 'Sprawdzam stan środowiska…' };
  }

  const supabase = dane.supabase || {};
  const pgvector = dane.pgvector || {};
  const dimCheck = dane.dimCheck || {};
  const ollama = dane.ollama || {};

  // --- CZERWONA: nie działa nic ---------------------------------------------
  if (!supabase.ok) {
    return { poziom: 'awaria', ...POZIOMY.awaria, powod: 'Baza danych jest niedostępna — panel nie pokaże żadnych kolekcji.' };
  }
  if (pgvector.installed === false) {
    return { poziom: 'awaria', ...POZIOMY.awaria, powod: 'Brak rozszerzenia pgvector w bazie — wektorów nie da się ani zapisać, ani przeszukać.' };
  }
  if (dimCheck.code === 'dim_mismatch') {
    return {
      poziom: 'awaria',
      ...POZIOMY.awaria,
      powod: `Niezgodny wymiar wektorów: kolumna ma ${dimCheck.actual}, konfiguracja ${dimCheck.expected}. Nie zapisuj nic do czasu ujednolicenia.`,
    };
  }

  // Czy Ollama jest w ogóle na drodze do wektorów. Przy dostawcy chmurowym jej
  // stan NIE MÓWI NIC o możliwości indeksowania.
  const ollamaWGrze = (dane.config && dane.config.embedProvider) === 'ollama';

  // --- BURSZTYNOWA: widać dane, nie da się indeksować ------------------------
  //
  // WARUNEK `ollamaWGrze` DOPISANY — I TO NIE JEST USTĘPSTWO NA RZECZ POKAZU.
  //
  // Ten warunek stał tu goły, mimo że sąsiedni `maModelEmbeddingow` od zawsze
  // pytał najpierw, czy dostawcą jest Ollama (patrz jego pierwsza linia). Dwie
  // reguły o tej samej rzeczy rozstrzygały ją inaczej.
  //
  // Skutek na wdrożeniu z RAG_EMBED_PROVIDER=openrouter, gdzie Ollamy NIE MA
  // I NIE MA JEJ BYĆ: werdykt bursztynowy z komunikatem „nie da się zaindeksować
  // ani przeszukać", czyli zdaniem nieprawdziwym — wektory liczy wtedy chmura.
  // Bursztyn niesie się na diodę w rogu KAŻDEJ strony panelu, więc cała
  // aplikacja zgłaszała usterkę, której nie było.
  //
  // Znalezione przy przygotowaniu trybu pokazowego, ale to nie jest zmiana
  // pokazowa — na wdrożeniu chmurowym ta diagnoza była fałszywa niezależnie
  // od tego, co akurat widać na ekranie.
  if (ollamaWGrze && !ollama.ok) {
    return { poziom: 'ostrzezenie', ...POZIOMY.ostrzezenie, powod: 'Ollama nie odpowiada — dokumenty są widoczne, ale nie da się ich zaindeksować ani przeszukać.' };
  }
  if (!maModelEmbeddingow(dane)) {
    const model = (dane.config && dane.config.embedModel) || '—';
    return {
      poziom: 'ostrzezenie',
      ...POZIOMY.ostrzezenie,
      powod: `Brak modelu embeddingów „${model}" w Ollamie — pobierz go (ollama pull ${model}), inaczej indeksowanie nie ruszy.`,
    };
  }
  // „Nie sprawdzono" TEŻ jest bursztynem, nie zielenią. Dzieje się tak, gdy brakuje
  // funkcji rag_diag albo kolumny embeddingu: baza odpowiada, więc panel pokaże
  // kolekcje, ale nikt nie potwierdził, że da się indeksować. To dokładnie sytuacja
  // „widzę, nie mogę pisać" — czyli definicja bursztynu, nie zieleni.
  if (pgvector.installed == null || dimCheck.ok == null) {
    return {
      poziom: 'ostrzezenie',
      ...POZIOMY.ostrzezenie,
      powod: 'Nie udało się potwierdzić schematu wektorów (pgvector lub wymiar kolumny). Panel działa, indeksowanie może nie ruszyć.',
    };
  }

  // POWÓD WYMIENIA TYLKO TO, CO NAPRAWDĘ SPRAWDZONO. Zdanie „Baza, pgvector
  // i Ollama odpowiadają poprawnie" stało tu bezwarunkowo i przy dostawcy
  // chmurowym chwaliło się sprawdzeniem składnika, którego w tym układzie
  // nie ma. Ten sam werdykt czyta dioda w rogu każdej strony, więc obietnica
  // „po kliknięciu zobaczysz to samo" wymaga, żeby powód dotyczył rzeczy,
  // które na ekranie diagnostyki naprawdę widać.
  return {
    poziom: 'ok',
    ...POZIOMY.ok,
    powod: ollamaWGrze
      ? 'Baza, pgvector i Ollama odpowiadają poprawnie.'
      : 'Baza i pgvector odpowiadają poprawnie.',
  };
}
