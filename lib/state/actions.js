import { ACTION_TYPES } from "./actionTypes";

export const updateAgentField = (field, value) => ({
  type: ACTION_TYPES.UPDATE_AGENT_FIELD,
  payload: { field, value },
});

// Podmienia calego agenta (wczytanie z bazy do kreatora).
export const setAgent = (agent) => ({
  type: ACTION_TYPES.SET_AGENT,
  payload: { agent },
});

export const setActivity = (activity) => ({
  type: ACTION_TYPES.SET_ACTIVITY,
  payload: { activity },
});

export const setLastEvent = (event) => ({
  type: ACTION_TYPES.SET_LAST_EVENT,
  payload: { event },
});
