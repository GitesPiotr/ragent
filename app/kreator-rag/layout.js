import { Sidebar } from "@/components/workspace/Sidebar";
// Ten sam uklad co Projekty, Agenty i Baza wiedzy (sidebar + tresc) —
// wspoldzielimy arkusz, zeby wszystkie zakladki wygladaly identycznie.
import styles from "../projekty/layout.module.css";
// Arkusz samego panelu. Klasa .panel niesie zmienne kolorow modulu oraz reguly,
// ktore w oryginale malowaly dokument (body, button, input, label, h1) — tutaj
// sa zawezone do tego poddrzewa, zeby nie wyjsc poza zakladke.
import panel from "./kreator-rag.module.css";

// Kreator RAG jest GLOBALNY w obrebie konta, tak jak Baza wiedzy — kolekcje naleza
// do konta, nie do projektu. Trasa jest wiec plaska: /kreator-rag, bez [projectId].
// TLO PANELU SIEGA DOLU OKNA — i to jest powod, dla ktorego .panel wisi na TYM
// SAMYM elemencie co .content, zamiast na wewnetrznym <div>.
//
// .content jest `flex: 1` wewnatrz .shell, ktory ma `min-height: 100dvh`, wiec
// rozciaga sie na cala wysokosc okna. Osobny <div> w srodku mial wysokosc swojej
// tresci i konczyl sie tam, gdzie konczyl sie tekst — nizej przebijala biel.
//
// Odrzucone rozwiazanie: ujemne marginesy zjadajace padding rodzica. Dzialaloby,
// ale wymagaloby przepisania wartosci paddingu (32/28/64 px oraz 20/16/48 px
// w progu 720px) z app/projekty/layout.module.css do tego pliku — czyli kopii,
// ktora rozjechalaby sie po pierwszej zmianie w arkuszu WSPOLDZIELONYM przez
// /agenty, /wiedza, /czaty i /ustawienia. Zlozenie klas nie kopiuje niczego.
export default function KreatorRagLayout({ children }) {
  return (
    <div className={styles.shell}>
      <Sidebar />
      <main className={`${styles.content} ${panel.panel}`}>{children}</main>
    </div>
  );
}
