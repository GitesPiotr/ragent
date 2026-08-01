// Pojecia, ktore NIE maja jeszcze wlasnego pliku w ./knowledge.
// Trzymane tutaj, zeby latwo bylo je edytowac w jednym miejscu — a gdy
// powstana pelne pliki (knowledge/knowledgeBase.md itd.), wystarczy
// przeniesc tresc tam i dopisac wpis w lib/knowledge/concepts.js.
//
// Format jest taki sam jak w concepts.js: { id, title, markdown }.

export const EXTRA_CONCEPTS = [
  {
    id: "knowledgeBase",
    title: "Baza wiedzy agenta",
    markdown: `## Definicja
Baza wiedzy to **Twoje własne dokumenty**, z których agent korzysta, odpowiadając na pytania. Dzięki niej agent opiera się na Twoich materiałach (oferty, procedury, cenniki), a nie tylko na ogólnej wiedzy modelu.

## Magazyn należy do konta, nie do projektu
Wszystkie wgrane dokumenty trafiają do **jednego wspólnego magazynu** — zakładka „Baza wiedzy" w menu po lewej. Nie ma osobnych baz dla poszczególnych projektów.

Agent **nie posiada** plików, tylko je **wskazuje**. Ten sam dokument może być zaznaczony przez wielu agentów w różnych projektach — i zawsze jest to ten sam plik, nie kopia. Poprawiasz go w jednym miejscu, a zmiana działa wszędzie.

Usunięcie projektu **nie kasuje** dokumentów. Usunięcie pliku z magazynu odbiera go **wszystkim** agentom naraz — dlatego przed skasowaniem aplikacja wymienia z nazwy tych, którzy go używają.

## Po co to
- Agent odpowiada zgodnie z **Twoimi** realiami, a nie ogólnikami z internetu.
- Ogranicza zmyślanie — agent ma się opierać na tym, co mu dałeś.
- Wiedzę aktualizujesz, podmieniając dokument, bez zmiany osobowości i zasad.

## Jak o tym decydować w praktyce
- **Nie korzysta** — agent w ogóle nie zagląda do dokumentów. Dobre dla agentów czysto rozmówczych.
- **Korzysta z wybranych** — zaznaczasz konkretne pliki z magazynu. To jedyny tryb korzystania z wiedzy i tak ma być: agent ma czytać to, co mu wskazałeś, a nie wszystko, co kiedykolwiek wgrałeś.
- Zaznaczaj **tylko dokumenty z obszaru tego agenta**. Wiedza doklejana jest do jego instrukcji, więc każdy zbędny plik to koszt i szansa na pomyłkę.

## Typowe błędy
- **Zaznaczanie wszystkiego** — im więcej niepowiązanych dokumentów, tym większa szansa, że agent sięgnie nie po ten właściwy.
- **Nieaktualne dokumenty** — agent zacytuje stary cennik równie pewnie jak nowy.
- **Kasowanie pliku „u siebie"** — nie ma czegoś takiego. Plik jest wspólny; usuwając go z magazynu, zabierasz go też innym agentom.`,
  },
  {
    id: "rag",
    title: "RAG (wyszukiwanie w dokumentach)",
    markdown: `## Definicja
RAG to sposób korzystania z dokumentów, w którym agent **najpierw wyszukuje** fragmenty pasujące do pytania, a dopiero potem odpowiada — opierając się na tym, co znalazł.

## RAG a Baza wiedzy — to nie to samo
- **Baza wiedzy** *dokleja* całe zaznaczone pliki do instrukcji agenta. Agent widzi je zawsze i w całości, przy każdym pytaniu.
- **RAG** niczego nie dokleja. Przy każdym pytaniu przeszukuje kolekcję i podaje agentowi **tylko pasujące fragmenty** — z nazwą pliku i sekcją, więc może wskazać źródło.

To dwa osobne magazyny. Plik z Bazy wiedzy nie trafia sam do kolekcji RAG i odwrotnie.

## Po co to
- **Duże dokumenty** — regulamin na 80 stron doklejony w całości jest kosztowny i rozprasza model. Wyszukane trzy akapity nie są.
- **Cytowanie** — agent podaje, z którego pliku i której sekcji pochodzi odpowiedź.
- **Wiele dokumentów naraz** — kolekcja może mieć ich dziesiątki; do promptu trafia tylko to, co potrzebne.

## Jak o tym decydować w praktyce
- **Krótkie, zawsze potrzebne materiały** (cennik na jedną stronę, lista zasad) — wystarczy Baza wiedzy.
- **Długie materiały, z których za każdym razem potrzebny jest inny kawałek** (umowy, instrukcje, procedury) — RAG.
- Agent przeszukuje **całą wskazaną kolekcję**, nie pojedyncze pliki. Podział na kolekcje robisz w zakładce „Kreator RAG".

## Typowe błędy
- **Włączone wyszukiwanie bez wskazanej kolekcji** — agent nie ma czego przeszukać i przy każdym pytaniu powie, że nie ma dostępu do dokumentów.
- **Oczekiwanie, że RAG zobaczy pliki z Bazy wiedzy** — nie zobaczy. Dokumenty do przeszukiwania wgrywasz do kolekcji.
- **Jedna wielka kolekcja na wszystko** — im więcej niepowiązanych tematów, tym większa szansa, że wyszukiwanie trafi w niewłaściwy fragment.`,
  },
  {
    id: "qa",
    title: "Pytania i odpowiedzi (Q&A)",
    markdown: `## Definicja
Q&A to **gotowe pary pytanie–odpowiedź**, które uczą agenta reagowania **przez przykład**. Zamiast opisywać regułę słowami, pokazujesz wzorcową odpowiedź.

## Po co to
- Najskuteczniejszy sposób na ustawienie **tonu i formy** odpowiedzi — przykład działa mocniej niż opis.
- Zapewnia powtarzalność w pytaniach, które wracają najczęściej.
- Pozwala z góry ustalić odpowiedź na pytania trudne lub drażliwe.

## Jak o tym decydować w praktyce
- Zacznij od **5–10 najczęstszych pytań** klientów lub współpracowników.
- Odpowiedzi pisz dokładnie tak, jak chcesz, żeby brzmiał agent — to jest wzorzec, który skopiuje.
- Dokładaj pary wtedy, gdy zauważysz, że agent odpowiada nie tak, jak chcesz.

## Typowe błędy
- **Zbyt ogólne odpowiedzi** — nie dają wzorca, agent i tak improwizuje.
- **Sprzeczne pary** — dwie różne odpowiedzi na to samo pytanie dają nieprzewidywalny efekt.
- **Mylenie Q&A z zasadami** — zasada mówi „jak zawsze się zachowuj", Q&A pokazuje „tak odpowiedz na TO pytanie".`,
  },
  {
    id: "io",
    title: "Wejście i wyjście",
    markdown: `## Definicja
Wejście i wyjście określa, **co agent przyjmuje** (np. samo pytanie, pytanie plus dokument) i **w jakim formacie odpowiada** — zwykły tekst, markdown albo JSON.

## Po co to
- Format odpowiedzi decyduje, czy wynik nadaje się do wklejenia, wyświetlenia czy przetworzenia przez inny program.
- Ustalone wejście oznacza mniej nieporozumień co do tego, czego agent oczekuje.

## Jak o tym decydować w praktyce
- **Tekst** — do rozmowy i odpowiedzi czytanych przez człowieka.
- **Markdown** — gdy przydają się nagłówki, listy i pogrubienia (raporty, podsumowania).
- **JSON** — gdy odpowiedź ma trafić do innego systemu i musi mieć stałą strukturę.

## Typowe błędy
- **Wybór JSON „na wszelki wypadek"** — utrudnia czytanie odpowiedzi człowiekowi.
- **Format sprzeczny z osobowością** — agent „piszący swobodnie" i wymuszony sztywny JSON będą się gryźć.`,
  },
  {
    id: "test",
    title: "Test agenta",
    markdown: `## Definicja
Test agenta to miejsce, w którym **rozmawiasz z gotowym agentem** i podglądasz **jego finalną instrukcję** — czyli tekst, który aplikacja wysyła do modelu przy każdej wiadomości.

## Po co to
- Sprawdzasz efekt ustawień **od razu**, bez wychodzenia z kreatora.
- Widzisz, jak z osobno wypełnianych sekcji powstaje **jedna instrukcja**. To najszybszy sposób, żeby zrozumieć, czym właściwie jest agent: to konfiguracja zamieniona w tekst dla modelu.
- Gdy agent odpowiada nie tak, jak chcesz, podgląd pokazuje, **która sekcja** za to odpowiada.

## Test agenta a mentor — to nie to samo
- **Mentor** uczy Cię *budować* agenta: tłumaczy pojęcia i podpowiada ustawienia.
- **Test agenta** to rozmowa z *tym, co zbudowałeś* — odpowiada Twój agent, ze swoją osobowością, zasadami i wiedzą.

## Jak z tego korzystać
1. Zadaj pytanie typowe dla zastosowania agenta.
2. Jeśli odpowiedź nie pasuje — zajrzyj w podgląd instrukcji i sprawdź, czy dana sekcja w ogóle się w niej znalazła.
3. Popraw właściwą sekcję i zapytaj ponownie.

## Typowe błędy
- **Testowanie bez zapisania** — czat działa na bieżących ustawieniach, ale żeby przetrwały odświeżenie, trzeba kliknąć „Zapisz".
- **Mylenie ról** — narzekanie mentorowi na odpowiedzi agenta (albo odwrotnie).`,
  },
];

export function getExtraConcept(id) {
  return EXTRA_CONCEPTS.find((c) => c.id === id) ?? null;
}
