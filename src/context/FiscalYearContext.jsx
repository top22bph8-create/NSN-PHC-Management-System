import { createContext, useContext, useState } from 'react';
import { currentFiscalYear, fiscalYearOptions } from '../lib/thai';

const Ctx = createContext(null);
export const useFiscalYear = () => useContext(Ctx);

const KEY = 'nsn-fiscal-year';

export function FiscalYearProvider({ children }) {
  const [fy, setFyState] = useState(() => {
    try {
      const saved = Number(localStorage.getItem(KEY));
      if (fiscalYearOptions().includes(saved)) return saved;
    } catch { /* ignore */ }
    return currentFiscalYear();
  });
  const setFy = (y) => {
    setFyState(Number(y));
    try { localStorage.setItem(KEY, String(y)); } catch { /* ignore */ }
  };
  return <Ctx.Provider value={{ fy, setFy, options: fiscalYearOptions() }}>{children}</Ctx.Provider>;
}
