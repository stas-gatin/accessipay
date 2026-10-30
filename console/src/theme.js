import { createContext, useContext } from 'react';
import { themeQuartz, colorSchemeDark } from 'ag-grid-community';

const KEY = 'accessipay-theme';

export function initialTheme() {
  try { return localStorage.getItem(KEY) === 'dark' ? 'dark' : 'light'; } catch { return 'light'; }
}

export function applyTheme(t) {
  document.documentElement.dataset.theme = t;
  try { localStorage.setItem(KEY, t); } catch { /* private mode: the choice just is not remembered */ }
}

export const ThemeContext = createContext('light');
export const useTheme = () => useContext(ThemeContext);

const common = { fontFamily: 'Inter, system-ui, sans-serif', fontSize: 14, headerFontSize: 13, headerFontWeight: 600, rowHeight: 46, headerHeight: 44, borderRadius: 8, wrapperBorderRadius: 14, spacing: 8 };

const light = themeQuartz.withParams({
  ...common,
  backgroundColor: '#ffffff', foregroundColor: '#0f141a', headerBackgroundColor: '#f0f2f5', headerTextColor: '#3f4a55',
  borderColor: '#e0e4e9', rowHoverColor: '#f6f7f9', selectedRowBackgroundColor: 'rgba(7, 122, 92, 0.08)', accentColor: '#077a5c',
});
const dark = themeQuartz.withPart(colorSchemeDark).withParams({
  ...common,
  backgroundColor: '#12151a', foregroundColor: '#eef1f4', headerBackgroundColor: '#181c22', headerTextColor: '#c3cad2',
  borderColor: '#262b33', rowHoverColor: '#181c22', selectedRowBackgroundColor: 'rgba(94, 241, 194, 0.08)', accentColor: '#5ef1c2',
});
export const gridTheme = (t) => (t === 'dark' ? dark : light);
