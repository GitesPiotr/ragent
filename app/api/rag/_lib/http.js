// Wspólny helper warstwy HTTP. Folder z prefiksem "_" jest prywatny w App Routerze
// (nie tworzy trasy). Koperta błędu wg sekcji 10.2: { error: { code, message } }.

import { NextResponse } from 'next/server';

// Mapowanie kodów domenowych (sekcja 10.2) na status HTTP.
const STATUS_BY_CODE = {
  no_key: 503,
  ollama_unavailable: 503,
  dim_mismatch: 409,
  model_mismatch: 409,
  no_text: 422,
  limit_exceeded: 413,
  not_found: 404,
  invalid_input: 400,
};

export function ok(data, init) {
  return NextResponse.json(data, init);
}

// Zamienia błąd rdzenia na kopertę HTTP. Znany kod → jego status; nieznany/awaria
// serwera → 500 z kodem "internal" (kody z 10.2 to błędy domenowe, nie transportowe).
export function fail(error) {
  const known = error && error.code && STATUS_BY_CODE[error.code];
  const code = known ? error.code : 'internal';
  const status = known ? STATUS_BY_CODE[error.code] : 500;
  const message = (error && error.message) || 'Wystąpił nieoczekiwany błąd.';
  return NextResponse.json({ error: { code, message } }, { status });
}
