export let language: 'en' | 'es' = localStorage.getItem('tonada-language') === 'es' ? 'es' : 'en';
export function setLanguage(value: 'en' | 'es') {
  language = value;
  localStorage.setItem('tonada-language', value);
  document.documentElement.lang = value;
}
export const t = (en: string, es: string) => (language === 'en' ? en : es);
export const esc = (value: unknown) =>
  String(value).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
