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
export async function POST(request) {
  const supabase = isSupabaseConfigured ? await createClient() : null;
  if (!supabase) {
    return NextResponse.json(
      { error: "Brak konfiguracji Supabase. Uzupełnij .env.local." },
      { status: 500 },
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

    // 2) Storage: <project_id>/<timestamp>-<nazwa>
    const path = `${projectId}/${Date.now()}-${safeStorageName(fileName)}`;
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
        return NextResponse.json(
          {
            error:
              "Storage odrzucił zapis (brak polityki dostępu). Uruchom skrypt supabase/004_knowledge.sql, który zakłada bucket i politykę.",
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
