import { NextResponse } from "next/server";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import {
  extractTextFromFile,
  isAcceptedFile,
  ACCEPTED_EXTENSIONS,
  MAX_FILE_BYTES,
} from "@/lib/knowledge/extractText";

export const runtime = "nodejs";

const BUCKET = "knowledge";

// Bezpieczna nazwa pliku w Storage: bez polskich znakow, spacji i sciezek.
function safeStorageName(fileName) {
  return String(fileName)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .slice(-80);
}

// Upload pliku wiedzy: ekstrakcja tekstu -> Storage -> rekord w knowledge_files.
// Ekstrakcja MUSI byc serwerowa (PDF.js), dlatego plik idzie przez ten endpoint,
// a nie prosto z przegladarki do Storage.
//
// PLIK TRAFIA DO MAGAZYNU KONTA, NIE DO PROJEKTU.
//
// Trasa nie przyjmuje juz projectId. Wgrany plik jest od razu dostepny
// kazdemu agentowi tego konta, w kazdym projekcie — agent go sobie WSKAZE
// (agents.knowledge_file_ids), nie dostanie na wlasnosc.
//
// SCIEZKA W STORAGE: <owner_id>/<timestamp>-<nazwa>
//
// Pierwszy segment to id WLASCICIELA, nie projektu. Dwa powody:
//
//  1. Polityka dostepu do bucketu opiera sie wylacznie na tej sciezce
//     (split_part(name,'/',1) = auth.uid()), wiec nie potrzebuje zagladac
//     do zadnej tabeli. Gdyby opierala sie o knowledge_files, nie mialaby
//     sie o co oprzec przy zapisie: plik laduje w Storage ZANIM powstanie
//     wiersz w bazie (patrz kolejnosc krokow 2 i 3 nizej).
//  2. Baza wiedzy miala stac sie magazynem KONTA — i wlasnie sie stala.
//     Sciezka oparta o wlasciciela przetrwala te zmiane bez migracji
//     plikow: ani jeden obiekt nie musial sie ruszyc.
//
// CO ZNIKNELO STAD W ETAPIE B — I DLACZEGO NIC SIE PRZEZ TO NIE ROZSZCZELNILO.
//
// Stala tu bariera sprawdzajaca, czy projectId z formularza nalezy do tego
// konta. Chronila przed zasmiecaniem CUDZEGO projektu wlasnymi plikami:
// klucz obcy knowledge_files.project_id -> projects.id Postgres sprawdza
// systemowo, z pominieciem polityk, wiec wiersz z cudzym project_id
// i wlasnym owner_id przechodzil przez "with check" bez mrugniecia.
//
// Skoro plik nie trafia juz do zadnego projektu, bariera nie ma przedmiotu.
// To, co zostalo, wystarcza w calosci: getUser() nizej daje tozsamosc,
// z niej powstaje sciezka <owner_id>/..., polityka knowledge_wlasne_pliki
// pilnuje bucketu, a "with check" polityki knowledge_files_wlasne pilnuje
// wiersza. Zaden z tych bezpiecznikow nie odwolywal sie do projektu.
export async function POST(request) {
  const supabase = isSupabaseConfigured ? await createClient() : null;
  if (!supabase) {
    return NextResponse.json(
      { error: "Brak konfiguracji Supabase. Uzupełnij .env.local." },
      { status: 500 },
    );
  }

  // Tozsamosc: bez user.id nie da sie zlozyc sciezki w Storage, wiec musi byc
  // jawna. Trasy /api/* sa juz chronione przez proxy.js — to drugi bezpiecznik.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(
      { error: "Wymagane zalogowanie." },
      { status: 401 },
    );
  }

  let form;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "Nieprawidłowe zapytanie (oczekiwano formularza z plikiem)." },
      { status: 400 },
    );
  }

  const file = form.get("file");

  if (!file || typeof file.arrayBuffer !== "function") {
    return NextResponse.json({ error: "Nie wybrano pliku." }, { status: 400 });
  }

  const fileName = file.name || "plik";

  if (!isAcceptedFile(fileName)) {
    return NextResponse.json(
      {
        error: `Nieobsługiwany typ pliku. Obsługujemy: ${ACCEPTED_EXTENSIONS.join(", ")}.`,
      },
      { status: 400 },
    );
  }
  if (file.size > MAX_FILE_BYTES) {
    return NextResponse.json(
      {
        error: `Plik jest za duży (${(file.size / 1024 / 1024).toFixed(1)} MB). Limit to ${MAX_FILE_BYTES / 1024 / 1024} MB.`,
      },
      { status: 413 },
    );
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());

    // 1) Ekstrakcja tekstu. Blad ekstrakcji NIE przerywa uploadu —
    //    plik i tak zapisujemy, tylko z czytelnym statusem.
    const { text, status, message } = await extractTextFromFile(
      buffer,
      fileName,
    );

    // 2) Storage: <owner_id>/<timestamp>-<nazwa> — uzasadnienie w naglowku pliku.
    const path = `${user.id}/${Date.now()}-${safeStorageName(fileName)}`;
    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(path, buffer, {
        contentType: file.type || "application/octet-stream",
        upsert: false,
      });

    if (uploadError) {
      const msg = String(uploadError.message || "");
      if (/bucket not found/i.test(msg)) {
        return NextResponse.json(
          {
            error:
              'Nie znaleziono bucketu "knowledge" w Supabase Storage. Uruchom skrypt supabase/004_knowledge.sql.',
          },
          { status: 500 },
        );
      }
      if (/row-level security|not authorized|permission/i.test(msg)) {
        // UWAGA: wczesniej stala tu rada "uruchom supabase/004_knowledge.sql".
        // Po Sesji 5 jest szkodliwa — 004 zaklada STARA, otwarta polityke
        // na caly bucket (dla anon wlacznie), a my ja celowo zastapilismy
        // polityka na wlasciciela. Odtworzenie jej odsloniloby pliki
        // wszystkich kont. Wlasciwa polityke zaklada 013_rls_storage.sql.
        return NextResponse.json(
          {
            error:
              "Magazyn plików (Storage) odrzucił zapis. Najczęściej znaczy to, że sesja wygasła — wyloguj się i zaloguj ponownie. Każde konto może zapisywać wyłącznie do własnego folderu.",
          },
          { status: 403 },
        );
      }
      return NextResponse.json(
        { error: `Nie udało się wgrać pliku: ${msg}` },
        { status: 500 },
      );
    }

    // 3) Rekord w bazie. Bez project_id — owner_id wpisuje baza z auth.uid()
    //    (migracja 007), i to on jest jedynym zakresem wlasnosci pliku.
    const { data, error: insertError } = await supabase
      .from("knowledge_files")
      .insert({
        file_name: fileName,
        file_path: path,
        size: file.size,
        mime_type: file.type || null,
        extracted_text: text || null,
        status,
        status_message: message,
      })
      // Ten sam zestaw kolumn co LIST_COLUMNS w lib/data/knowledge.js —
      // bez project_id, zeby migracja 015 nie wywrocila tej trasy.
      .select(
        "id, file_name, file_path, size, mime_type, status, status_message, created_at",
      )
      .single();

    if (insertError) {
      // Sprzatamy plik, zeby nie zostawal w Storage sierota bez rekordu.
      await supabase.storage.from(BUCKET).remove([path]);

      const msg = String(insertError.message || "");
      if (/relation .* does not exist|Could not find the table/i.test(msg)) {
        return NextResponse.json(
          {
            error:
              "Brak tabeli knowledge_files. Uruchom skrypt supabase/004_knowledge.sql w Supabase → SQL Editor.",
          },
          { status: 500 },
        );
      }
      return NextResponse.json(
        { error: `Nie udało się zapisać pliku w bazie: ${msg}` },
        { status: 500 },
      );
    }

    return NextResponse.json({
      file: data,
      // Podglad dla UI — ile tekstu udalo sie wyciagnac.
      textLength: text ? text.length : 0,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error?.message || "Nieoczekiwany błąd podczas wgrywania pliku." },
      { status: 500 },
    );
  }
}
