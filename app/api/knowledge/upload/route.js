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
// SCIEZKA W STORAGE: <owner_id>/<timestamp>-<nazwa>
//
// Pierwszy segment to id WLASCICIELA, nie projektu. Dwa powody:
//
//  1. Polityka dostepu do bucketu opiera sie wylacznie na tej sciezce
//     (split_part(name,'/',1) = auth.uid()), wiec nie potrzebuje zagladac
//     do zadnej tabeli. Gdyby opierala sie o knowledge_files, nie mialaby
//     sie o co oprzec przy zapisie: plik laduje w Storage ZANIM powstanie
//     wiersz w bazie (patrz kolejnosc krokow 2 i 3 nizej).
//  2. Baza wiedzy staje sie magazynem KONTA, nie projektu — pliki przestana
//     byc przypisane do jednego projektu. Sciezka oparta o wlasciciela
//     przetrwa te zmiane bez migracji.
//
// knowledge_files.project_id NADAL istnieje i jest wypelniane — zmienil sie
// wylacznie uklad katalogow w Storage.
export async function POST(request) {
  const supabase = isSupabaseConfigured ? await createClient() : null;
  if (!supabase) {
    return NextResponse.json(
      { error: "Brak konfiguracji Supabase. Uzupełnij .env.local." },
      { status: 500 },
    );
  }

  // Tozsamosc jest tu potrzebna do DWOCH rzeczy: zbudowania sciezki w Storage
  // oraz sprawdzenia, czy projekt nalezy do tego konta. Trasy /api/* sa juz
  // chronione przez proxy.js, wiec to drugi bezpiecznik — ale bez user.id
  // nie da sie zlozyc sciezki, wiec i tak musi byc jawny.
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

  const projectId = form.get("projectId");
  const file = form.get("file");

  if (!projectId || typeof projectId !== "string") {
    return NextResponse.json(
      { error: "Brak identyfikatora projektu." },
      { status: 400 },
    );
  }
  if (!file || typeof file.arrayBuffer !== "function") {
    return NextResponse.json({ error: "Nie wybrano pliku." }, { status: 400 });
  }

  // CZY TEN PROJEKT NALEZY DO CIEBIE.
  //
  // projectId przychodzi z formularza, czyli od klienta — dokladnie ta sama
  // klasa problemu co pulapka nr 1 (loadKnowledgeFilesForAgent ufal project_id
  // z ciala zadania). Samo RLS tego NIE domyka: klucz obcy
  // knowledge_files.project_id -> projects.id Postgres sprawdza systemowo,
  // z pominieciem polityk, wiec wiersz z cudzym project_id i wlasnym owner_id
  // przeszedlby przez "with check" bez mrugniecia.
  //
  // Skutkiem nie jest wyciek (cudzego projektu i tak nie widac), tylko
  // zasmiecanie go wlasnymi plikami. Tanio to zamknac tutaj: zapytanie
  // podlega RLS, wiec cudzy projekt zwroci null.
  //
  // Sprawdzamy PRZED ekstrakcja tekstu — nie ma po co mielic pliku, zeby
  // za chwile go odrzucic.
  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("id")
    .eq("id", projectId)
    .maybeSingle();

  if (projectError) {
    // Najczestszy przypadek: projectId nie jest poprawnym UUID (kod 22P02).
    return NextResponse.json(
      { error: "Nieprawidłowy identyfikator projektu." },
      { status: 400 },
    );
  }
  if (!project) {
    // 404, a nie 403 — nie potwierdzamy, ze taki projekt w ogole istnieje.
    return NextResponse.json(
      { error: "Nie znaleziono projektu albo nie masz do niego dostępu." },
      { status: 404 },
    );
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

    // 3) Rekord w bazie.
    const { data, error: insertError } = await supabase
      .from("knowledge_files")
      .insert({
        project_id: projectId,
        file_name: fileName,
        file_path: path,
        size: file.size,
        mime_type: file.type || null,
        extracted_text: text || null,
        status,
        status_message: message,
      })
      .select(
        "id, project_id, file_name, file_path, size, mime_type, status, status_message, created_at",
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
