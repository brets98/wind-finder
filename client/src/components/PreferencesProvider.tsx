import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { apiGet, apiPatch } from '../lib/api';
import { PreferencesContext } from '../lib/preferences';
import type { Unit } from '../lib/units';

/** The signed-in user's preferences, saved on the server so they follow them on every device. */
export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [unit, setUnitState] = useState<Unit>('knots');

  useEffect(() => {
    apiGet<{ unit: Unit }>('/me/preferences')
      .then((prefs) => setUnitState(prefs.unit))
      .catch(() => {});
  }, []);

  const setUnit = useCallback((next: Unit) => {
    setUnitState(next);
    apiPatch('/me/preferences', { unit: next }).catch(() => {});
  }, []);

  const value = useMemo(() => ({ unit, setUnit }), [unit, setUnit]);
  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
}
