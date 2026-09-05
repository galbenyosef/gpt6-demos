import React, {useEffect, useState} from 'react';
import {ChevronDown, Palette} from 'lucide-react';
import type {Lang} from './data';

export const themes = {
  forest: {name: {en: 'Forest Charcoal', es: 'Carbón del Bosque'}, background: '#101411', back: '#18221e', glow: '#27352b', ink: '#101915', seal: '#17231d', line: '#aa8d51', accent: '#c5aa6e', metal: '#b8a16c'},
  midnight: {name: {en: 'Midnight Obsidian', es: 'Obsidiana Nocturna'}, background: '#070b14', back: '#101a30', glow: '#203552', ink: '#090e1c', seal: '#111d33', line: '#889fca', accent: '#c1cfe9', metal: '#9baecf'},
  moonstone: {name: {en: 'Moonstone Veil', es: 'Velo de Piedra Lunar'}, background: '#fafafb', back: '#eceef2', glow: '#ffffff', ink: '#dfe3ea', seal: '#f6f7fa', line: '#737c90', accent: '#505d77', metal: '#919cad'},
} as const;
export type Theme = keyof typeof themes;
export function savedTheme(): Theme {
  try {const value = localStorage.getItem('arcana-theme'); if(value && Object.hasOwn(themes, value)) return value as Theme;} catch {}
  return 'forest';
}
export function useTheme() {
  const [theme, setTheme] = useState<Theme>(savedTheme);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', themes[theme].background);
    try {localStorage.setItem('arcana-theme', theme);} catch {}
  }, [theme]);
  return [theme, setTheme] as const;
}
export function ThemeSelector({theme, onChange, lang}: {theme: Theme; onChange: (theme: Theme)=>void; lang: Lang}) {
  return <label className="theme-selector">
    <Palette size={15} strokeWidth={1.3} aria-hidden="true"/>
    <select aria-label={lang === 'en' ? 'Color theme' : 'Tema de color'} value={theme} onChange={e=>onChange(e.target.value as Theme)}>
      {Object.entries(themes).map(([id, option])=><option value={id} key={id}>{option.name[lang]}</option>)}
    </select>
    <ChevronDown size={13} aria-hidden="true"/>
  </label>;
}
