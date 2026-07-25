import { ACTION_TYPES } from "./actionTypes";

export function appReducer(state, action) {
  switch (action.type) {
    case ACTION_TYPES.UPDATE_AGENT_FIELD:
      return {
        ...state,
        agent: {
          ...state.agent,
          [action.payload.field]: action.payload.value,
        },
      };

    // Podmiana calego agenta. Scalamy z dotychczasowym ksztaltem, zeby
    // brak pola w danych z bazy nie zrobil z pola undefined (kreator jest
    // kontrolowany i undefined zamienilby input w niekontrolowany).
    case ACTION_TYPES.SET_AGENT:
      return {
        ...state,
        agent: { ...state.agent, ...action.payload.agent },
      };

    case ACTION_TYPES.SET_ACTIVITY:
      return {
        ...state,
        activity: action.payload.activity,
      };

    case ACTION_TYPES.SET_LAST_EVENT:
      return {
        ...state,
        lastEvent: action.payload.event,
      };

    default:
      return state;
  }
}
