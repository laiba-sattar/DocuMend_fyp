import { useEffect, useState } from 'react';
import { ThemeContext } from './theme';

export function ThemeProvider({ children }) {
  const [darkMode, setDarkMode] = useState(() => {
    try {
      const saved = localStorage.getItem('documend_dark_mode');
      return saved !== null ? JSON.parse(saved) : true;
    } catch {
      return true;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('documend_dark_mode', JSON.stringify(darkMode));
    } catch {
      // ignore
    }

    if (darkMode) {
      document.documentElement.classList.add('dash-dark');
      document.body.classList.add('dash-dark');
    } else {
      document.documentElement.classList.remove('dash-dark');
      document.body.classList.remove('dash-dark');
    }
  }, [darkMode]);

  const toggleDarkMode = () => {
    setDarkMode((prev) => !prev);
  };

  return (
    <ThemeContext.Provider value={{ darkMode, setDarkMode, toggleDarkMode }}>
      {children}
    </ThemeContext.Provider>
  );
}
