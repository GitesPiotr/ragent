"use client";

import { createContext, useContext } from "react";

// Wspoldzielony stan layoutu mentora: strona liczy geometrie (szerokosc panelu,
// szerokosc kreatora), a MentorPanel korzysta z open/setOpen, szerokosci i
// uchwytu (separatorProps). Dzieki temu przeciaganie krawedzi mentora moze
// jednoczesnie zwezac kreator renderowany po stronie strony.
export const MentorLayoutContext = createContext(null);

export function useMentorLayout() {
  const ctx = useContext(MentorLayoutContext);
  if (!ctx) {
    throw new Error("useMentorLayout musi byc uzyte wewnatrz MentorLayoutContext");
  }
  return ctx;
}
