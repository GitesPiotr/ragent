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

## Po co to
- Agent odpowiada zgodnie z **Twoimi** realiami, a nie ogólnikami z internetu.
- Ogranicza zmyślanie — agent ma się opierać na tym, co mu dałeś.
- Wiedzę aktualizujesz, podmieniając dokument, bez zmiany osobowości i zasad.

## Jak o tym decydować w praktyce
- **Wszystkie pliki** — agent przeszukuje całą bazę. Wygodne, gdy dokumentów jest mało i dotyczą jednego tematu.
- **Wybrane pliki** — wskazujesz konkretne dokumenty. Lepsze, gdy baza jest duża albo agent ma działać tylko w wąskim obszarze.

## Typowe błędy
- **Wrzucenie wszystkiego naraz** — im więcej niepowiązanych dokumentów, tym większa szansa, że agent sięgnie nie po ten właściwy.
- **Nieaktualne dokumenty** — agent zacytuje stary cennik równie pewnie jak nowy.`,
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
