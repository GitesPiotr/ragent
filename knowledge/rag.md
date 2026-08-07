# RAG (wyszukiwanie w dokumentach)

## Definicja
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
- **Jedna wielka kolekcja na wszystko** — im więcej niepowiązanych tematów, tym większa szansa, że wyszukiwanie trafi w niewłaściwy fragment.
