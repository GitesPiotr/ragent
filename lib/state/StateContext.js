"use client";

import { createContext, useContext, useReducer } from "react";
import { appReducer } from "./reducer";
import { initialState } from "./initialState";

const AppStateContext = createContext(null);

export function StateProvider({ children }) {
  const [state, dispatch] = useReducer(appReducer, initialState);

  return (
    <AppStateContext.Provider value={{ state, dispatch }}>
      {children}
    </AppStateContext.Provider>
  );
}

export function useAppState() {
  const context = useContext(AppStateContext);

  if (context === null) {
    throw new Error("useAppState must be used within a StateProvider");
  }

  return context;
}
