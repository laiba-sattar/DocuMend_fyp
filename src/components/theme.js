import { createContext, useContext } from 'react';

// Default initial values taake kabhi bhi context undefined na ho
export const defaultThemeState = {
  darkMode: false,
  setDarkMode: () => {},
  toggleDarkMode: () => {},
};

export const ThemeContext = createContext(defaultThemeState);

// CRASH-PROOF HOOK: Yeh kabhi error throw nahi karega
export function useTheme() {
  const context = useContext(ThemeContext);
  return context || defaultThemeState;
}
