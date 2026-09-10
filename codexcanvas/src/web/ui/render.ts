import { marked } from 'marked';
import DOMPurify from 'dompurify';
import hljs from 'highlight.js/lib/core';
import javascript from 'highlight.js/lib/languages/javascript';
import typescript from 'highlight.js/lib/languages/typescript';
import python from 'highlight.js/lib/languages/python';
import bash from 'highlight.js/lib/languages/bash';
import json from 'highlight.js/lib/languages/json';
import rust from 'highlight.js/lib/languages/rust';
import css from 'highlight.js/lib/languages/css';
import xml from 'highlight.js/lib/languages/xml';
import sql from 'highlight.js/lib/languages/sql';
import parseDiff from 'parse-diff';
import type { Item } from '../../shared/types';
for (const [name, language] of Object.entries({ javascript, typescript, python, bash, json, rust, css, xml, sql })) hljs.registerLanguage(name, language);
export const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text?: string): HTMLElementTagNameMap[K] => { const node = document.createElement(tag); node.className = className; if (text !== undefined) node.textContent = text; return node; };
export function button(label: string, action: () => void, className = '') { const b = el('button', className, label); b.type = 'button'; b.onclick = action; return b; }
export function safeUrl(value: string): string | undefined { try { const url = new URL(value); if (['http:', 'https:'].includes(url.protocol)) return url.href; } catch {} }
export function markdown(node: HTMLElement, text: string) {
  node.innerHTML = DOMPurify.sanitize(marked.parse(text, { async: false, gfm: true }) as string, { FORBID_TAGS: ['img', 'style', 'form', 'input', 'iframe'], FORBID_ATTR: ['style'] });
  for (const link of node.querySelectorAll('a')) { if (!safeUrl(link.href)) link.removeAttribute('href'); link.target = '_blank'; link.rel = 'noopener noreferrer'; }
  for (const code of node.querySelectorAll<HTMLElement>('pre code')) { try { hljs.highlightElement(code); } catch {} }
}
function languageForPath(path: string) {
  return ({ ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript', py: 'python', rs: 'rust', sh: 'bash', html: 'xml', css: 'css', json: 'json', sql: 'sql' } as Record<string, string>)[path.split('.').pop() ?? ''];
}
export function codeBlock(text: string, path = '') {
  const pre = el('pre', 'code-block'), code = el('code');
  const language = languageForPath(path);
  if (language) code.innerHTML = hljs.highlight(text, { language }).value; else code.textContent = text;
  pre.append(code); return pre;
}
export function terminal(text: string) {
  // Strip control sequences rather than interpreting OSC hyperlinks or executable HTML.
  return text.replace(/\x1b\][^\x07]*(?:\x07|\x1b\\)/g, '').replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '').replace(/\r(?!\n)/g, '\n');
}
export function diffView(text: string) {
  const root = el('div', 'diff-view');
  try {
    const files = parseDiff(text);
    if (!files.length) { root.append(codeBlock(text)); return root; }
    for (const file of files) {
      root.append(el('div', 'diff-file-heading', file.to ?? file.from ?? 'Changes'));
      for (const chunk of file.chunks) {
        root.append(el('div', 'diff-hunk', chunk.content));
        for (const line of chunk.changes) {
          const row = el('div', `diff-line ${line.type}`);
          row.append(el('span', 'line-number', String('ln1' in line ? line.ln1 : line.type === 'del' ? line.ln : '')), el('span', 'line-number', String('ln2' in line ? line.ln2 : line.type === 'add' ? line.ln : '')), el('code', '', line.content));
          const language = languageForPath(file.to ?? file.from ?? '');
          if (language) row.querySelector('code')!.innerHTML = DOMPurify.sanitize(hljs.highlight(line.content, { language }).value);
          root.append(row);
        }
      }
    }
  } catch { root.append(codeBlock(text)); }
  return root;
}
export function itemLabel(item: Item) { return item.command || item.path || item.query || item.text?.slice(0, 80) || ({ fileChange: 'File changes', turnDiff: 'Changes this turn', plan: 'Plan', contextCompaction: 'Context compacted' } as Record<string, string>)[item.type] || item.type; }
