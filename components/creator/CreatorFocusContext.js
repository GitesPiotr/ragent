"use client";

import { createContext, useContext } from "react";

// =============================================================================
//  OGNISKO KREATORA — KTORA KARTA JEST OTWARTA.
//
//  Do tej pory `activeId` siedzial w lokalnym stanie MasterDetailCreator
//  i nie wychodzil poza niego. Mentor montuje sie obok kreatora, bez propsow,
//  wiec nie mial jak sie dowiedziec, na co patrzy uzytkownik: klikniecie karty
//  „RAG" i pytanie „co to jest?" trafialo w mentora, ktory nie wiedzial,
//  o czym mowa.
//
//  DLACZEGO NIE W STANIE GLOBALNYM (StateContext/state.agent):
//  tamten stan to DANE AGENTA, ktore leca do bazy. isSameConfig porownuje je
//  z migawka, zeby wykryc niezapisane zmiany — otwarta karta zapalilaby
//  „• Niezapisane zmiany" od samego klikania po interfejsie i dalaby sie
//  zapisac do kolumny, ktorej nie ma.
//
//  DLACZEGO OSOBNY KONTEKST, A NIE MentorLayoutContext:
//  tamten opisuje GEOMETRIE panelu (szerokosc, przeciaganie, otwarcie).
//  Ognisko kreatora to inna rzecz i innego wlasciciela ma na ekranie —
//  doklejenie go tam zrobiloby z MentorLayoutContext worek na „rozne rzeczy
//  strony".
//
//  Wlascicielem stanu jest KOMPONENT STRONY (app/projekty/[projectId]/agenty/
//  [agentId]/page.js) — tak samo jak przy mentorOpen i mentorWidth, ktore
//  juz tam mieszkaja z tego samego powodu: potrzebuja ich dwa rodzenstwa.
// =============================================================================
export const CreatorFocusContext = createContext(null);

// Zwraca { activeId, setActiveId }.
//
// NIE RZUCA POZA PROVIDEREM, inaczej niz useMentorLayout. Panel mentora ma
// dzialac takze wtedy, gdy ktos zamontuje go poza strona agenta — brak
// informacji o ognisku jest wtedy poprawnym stanem („nie wiem, gdzie stoi"),
// a nie awaria. Domyslka mowi to wprost: null i pusta funkcja.
export function useCreatorFocus() {
  return (
    useContext(CreatorFocusContext) || {
      activeId: null,
      setActiveId: () => {},
    }
  );
}
