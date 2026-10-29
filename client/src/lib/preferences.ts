import { createContext, useContext } from 'react';
import type { Unit } from './units';

export interface PreferencesValue {
  unit: Unit;
  setUnit: (unit: Unit) => void;
}

// Without a provider (tests): knots, fixed
export const PreferencesContext = createContext<PreferencesValue>({
  unit: 'knots',
  setUnit: () => {},
});

export function usePreferences() {
  return useContext(PreferencesContext);
}
