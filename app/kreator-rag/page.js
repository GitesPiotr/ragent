import { redirect } from 'next/navigation';

// Korzeń panelu prowadzi do KOLEKCJI, nie do diagnostyki.
//
// Do Sesji 0 diagnostyka była tu stroną główną, bo była wtedy jedyną stroną
// modułu. Została nią z rozpędu przez wszystkie kolejne sesje, choć po drodze
// panel dorobił się kolekcji, dokumentów, mapy i grafu. Odkąd diagnostyka ma
// własny przycisk z diodą w rogu KAŻDEJ strony panelu, nie ma powodu, żeby
// wejście do zakładki lądowało na ekranie, który odwiedza się raz na kilka
// tygodni — wchodzi się tu po kolekcje.
//
// DLACZEGO PRZEKIEROWANIE, A NIE LISTA KOLEKCJI WPROST TUTAJ:
// ta sama treść pod dwoma adresami (/kreator-rag i /kreator-rag/kolekcje)
// rozjeżdża zakładki, linki i ścieżkę nawigacji. Usunięcie /kreator-rag/kolekcje
// na rzecz korzenia jest jeszcze gorsze: dzieci zostają pod /kreator-rag/kolekcje/[id],
// więc wisiałyby pod rodzicem, którego nie ma, a breadcrumb „Kolekcje" nie miałby
// dokąd prowadzić. Przekierowanie zostawia jedną treść pod jednym adresem
// i czytelną hierarchię: /kolekcje, /kolekcje/[id], /kolekcje/[id]/mapa, /diagnostyka.
//
// Sidebar celuje już wprost w /kreator-rag/kolekcje, więc normalne wejście nie
// płaci za ten skok. Przekierowanie zostaje dla korzenia modułu i starych zakładek.
export default function KreatorRagPage() {
  redirect('/kreator-rag/kolekcje');
}
