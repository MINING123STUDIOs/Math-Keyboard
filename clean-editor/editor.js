/*
 * Clean Editor - A fast, minimal code editor
 * Copyright (C) 2026 MINING123STUDIOS
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

(function () {
  'use strict';

  const STORAGE = 'ce-';
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  const textarea = $('#input');
  const hlCode = $('#hl-code');
  const highlight = $('#highlight');
  const gutter = $('#gutter');
  const findbar = $('#findbar');
  const findInput = $('#find-input');

  const findRegex = $('#find-regex');
  const findStatus = $('#find-status');
  const fileInput = $('#file-input');
  const modal = $('#confirm-modal');

  let codeMode = false;
  let currentLang = 'auto';
  let matchIndices = [];
  let matchIdx = -1;
  let hasContent = false;
  let lastFocusedElement = null; // a11y: tracks where to return focus after modal/close

  // ── Accessibility: screen reader announcements ──
  // Off-screen live region announces state changes (theme, code mode, etc.)
  const srAnnounce = $('#sr-announce');
  function announce(msg) {
    srAnnounce.textContent = '';
    srAnnounce.textContent = msg;
  }

  const INTRO_TEXT =
    'Clean Editor\n' +
    '\n' +
    'A fast, minimal code editor with syntax highlighting,\n' +
    'dark & light themes, auto-save, and find with regex.\n' +
    '\n' +
    'Getting Started\n' +
    '  Start typing to begin, or click \u2191 to import a file.\n' +
    '\n' +
    'Features\n' +
    '  Syntax highlighting for JS, HTML, CSS, Python, JSON\n' +
    '  Auto-save to browser (persists across refresh)\n' +
    '  Import / export files\n' +
    '  Find with regex (Ctrl+F)\n' +
    '\n' +
    'Start typing or press any key to begin.';

  function isShowingIntro() {
    return !hasContent && textarea.value === INTRO_TEXT;
  }

  // ── Debounce ──

  function debounce(fn, ms) {
    let t;
    return function (...args) {
      clearTimeout(t);
      t = setTimeout(() => fn.apply(this, args), ms);
    };
  }

  // ── Persistence ──
  // a11y: saves editor state to localStorage, restored on page load

  function saveState() {
    try {
      if (hasContent) {
        localStorage.setItem(STORAGE + 'content', textarea.value);
      } else {
        localStorage.removeItem(STORAGE + 'content');
      }
      localStorage.setItem(STORAGE + 'codemode', String(codeMode));
      localStorage.setItem(STORAGE + 'lang', currentLang);
      localStorage.setItem(STORAGE + 'theme', document.documentElement.classList.contains('light') ? 'light' : 'dark');
      const pos = { line: 0, col: 0 };
      const v = textarea.value;
      const selStart = textarea.selectionStart;
      let nl = 0;
      for (let i = 0; i < selStart && i < v.length; i++) {
        if (v[i] === '\n') nl++;
      }
      pos.line = nl;
      pos.col = selStart - v.lastIndexOf('\n', selStart - 1) - 1;
      localStorage.setItem(STORAGE + 'cursor', JSON.stringify(pos));
    } catch (e) { console.warn('Clean Editor: failed to save state', e); }
    showSaved();
    broadcastState();
  }

  function loadState() {
    try {
      const content = localStorage.getItem(STORAGE + 'content');
      if (content !== null && content.trim() !== '') {
        textarea.value = content;
        hasContent = true;
      } else {
        textarea.value = INTRO_TEXT;
        hasContent = false;
      }

      const cm = localStorage.getItem(STORAGE + 'codemode');
      if (cm === 'true') codeMode = true;

      const lang = localStorage.getItem(STORAGE + 'lang');
      if (lang) {
        currentLang = lang;
        $('#sel-lang').value = lang;
      }

      const theme = localStorage.getItem(STORAGE + 'theme');
      if (theme === 'light') {
        document.documentElement.classList.add('light');
      } else if (theme === null && matchMedia('(prefers-color-scheme: light)').matches) {
        document.documentElement.classList.add('light');
      }

      const cursor = localStorage.getItem(STORAGE + 'cursor');
      if (cursor && content !== null) {
        const pos = JSON.parse(cursor);
        let offset = 0;
        const lines = textarea.value.split('\n');
        for (let i = 0; i < pos.line && i < lines.length; i++) {
          offset += lines[i].length + 1;
        }
        offset += Math.min(pos.col, lines[pos.line] ? lines[pos.line].length : 0);
        textarea.setSelectionRange(offset, offset);
      }
    } catch (e) { console.warn('Clean Editor: failed to load state', e); }
  }

  const autoSave = debounce(saveState, 300);

  // ── Saved indicator ──

  let saveIndicatorTimer = null;

  function showSaved() {
    const el = $('#save-status');
    if (!el) return;
    el.textContent = 'Saved';
    el.classList.add('visible');
    clearTimeout(saveIndicatorTimer);
    saveIndicatorTimer = setTimeout(function () {
      el.classList.remove('visible');
    }, 1500);
  }

  // ── Multi-tab sync ──
  // BroadcastChannel keeps all open tabs identical in real-time.
  // When one tab saves, it broadcasts the content; other tabs update.

  let isSyncing = false;
  let channel = null;
  try { channel = new BroadcastChannel('clean-editor'); } catch (e) {}

  function broadcastState() {
    if (!channel || isSyncing) return;
    try {
      channel.postMessage({
        content: hasContent ? textarea.value : null,
        codemode: codeMode,
        lang: currentLang,
        theme: document.documentElement.classList.contains('light') ? 'light' : 'dark',
        wordwrap: wordWrap
      });
    } catch (e) {}
  }

  if (channel) {
    channel.onmessage = function (e) {
      const d = e.data;
      if (!d) return;
      isSyncing = true;
      if (d.content !== null && d.content !== textarea.value) {
        const pos = textarea.selectionStart;
        textarea.value = d.content;
        hasContent = true;
        textarea.classList.remove('intro');
        textarea.setSelectionRange(Math.min(pos, textarea.value.length), Math.min(pos, textarea.value.length));
      } else if (d.content === null && hasContent) {
        textarea.value = INTRO_TEXT;
        hasContent = false;
        textarea.classList.add('intro');
      }
      if (typeof d.codemode === 'boolean' && d.codemode !== codeMode) {
        codeMode = d.codemode;
        const toggle = $('#toggle-codemode');
        toggle.classList.toggle('active', codeMode);
        toggle.setAttribute('aria-checked', String(codeMode));
        toggle.setAttribute('aria-label', codeMode ? 'Code mode on' : 'Code mode off');
      }
      if (d.lang && d.lang !== currentLang) {
        currentLang = d.lang;
        $('#sel-lang').value = currentLang;
      }
      if (d.theme) {
        const isLight = d.theme === 'light';
        document.documentElement.classList.toggle('light', isLight);
      }
      if (typeof d.wordwrap === 'boolean' && d.wordwrap !== wordWrap) {
        toggleWordWrap();
      }
      render();
      // Keep isSyncing true long enough to suppress the autoSave broadcast,
      // then flush any changes that were made during the window.
      setTimeout(function () { isSyncing = false; broadcastState(); }, 500);
    };
  }

  // ── Syntax Highlighting ──

  function escapeHtml(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  const TOKENIZER = {
    js: function (code) {
      const out = [];
      let i = 0;
      const len = code.length;
      while (i < len) {
        if (code[i] === '/' && code[i + 1] === '/') {
          let end = code.indexOf('\n', i);
          if (end === -1) end = len;
          out.push('<span class="tok-comment">' + escapeHtml(code.slice(i, end)) + '</span>');
          i = end;
        } else if (code[i] === '/' && code[i + 1] === '*') {
          let end = code.indexOf('*/', i + 2);
          end = end === -1 ? len : end + 2;
          out.push('<span class="tok-comment">' + escapeHtml(code.slice(i, end)) + '</span>');
          i = end;
        } else if (code[i] === '"' || code[i] === "'" || code[i] === '`') {
          const q = code[i];
          if (q === '`') {
            // Template literal: handle ${} expressions inside
            let pos = i + 1;
            while (pos < len && code[pos] !== '`') {
              if (code[pos] === '\\') { pos += 2; continue; }
              if (code[pos] === '$' && code[pos + 1] === '{') {
                // Output prefix as string
                if (pos > i + 1) out.push('<span class="tok-string">' + escapeHtml(code.slice(i, pos)) + '</span>');
                // Find matching } with brace counting
                let j = pos + 2;
                let depth = 1;
                while (j < len && depth > 0) {
                  if (code[j] === '{') depth++;
                  else if (code[j] === '}') depth--;
                  else if (code[j] === '"' || code[j] === "'" || code[j] === '`') {
                    const sq = code[j]; j++;
                    while (j < len && code[j] !== sq) { if (code[j] === '\\') j++; j++; }
                  }
                  if (depth > 0) j++;
                }
                out.push('<span class="tok-operator">${</span>');
                out.push(TOKENIZER.js(code.slice(pos + 2, j)));
                out.push('<span class="tok-operator">}</span>');
                pos = j + 1;
                // Continue scanning for more ${} or closing backtick
              } else {
                pos++;
              }
            }
            pos = Math.min(pos + 1, len);
            out.push('<span class="tok-string">' + escapeHtml(code.slice(i, pos)) + '</span>');
            i = pos;
          } else {
            let j = i + 1;
            while (j < len && code[j] !== q) {
              if (code[j] === '\\') j++;
              j++;
            }
            j = Math.min(j + 1, len);
            out.push('<span class="tok-string">' + escapeHtml(code.slice(i, j)) + '</span>');
            i = j;
          }
        } else if (/\d/.test(code[i]) || (code[i] === '.' && i + 1 < len && /\d/.test(code[i + 1]))) {
          let j = i;
          if (code[j] === '0' && (code[j + 1] === 'x' || code[j + 1] === 'X')) {
            j += 2;
            while (j < len && /[0-9a-fA-F]/.test(code[j])) j++;
          } else {
            while (j < len && /[0-9.]/.test(code[j])) j++;
            if (j < len && (code[j] === 'e' || code[j] === 'E')) {
              j++;
              if (j < len && (code[j] === '+' || code[j] === '-')) j++;
              while (j < len && /\d/.test(code[j])) j++;
            }
          }
          out.push('<span class="tok-number">' + escapeHtml(code.slice(i, j)) + '</span>');
          i = j;
        } else if (/[a-zA-Z_$]/.test(code[i])) {
          let j = i;
          while (j < len && /[a-zA-Z0-9_$]/.test(code[j])) j++;
          const word = code.slice(i, j);
          if (/^(function|const|let|var|return|if|else|for|while|do|switch|case|break|continue|class|extends|new|this|typeof|instanceof|import|export|from|default|async|await|try|catch|finally|throw|yield|of|in|void|delete|super|static|get|set)$/.test(word)) {
            out.push('<span class="tok-keyword">' + escapeHtml(word) + '</span>');
          } else if (i + word.length < len && code[i + word.length] === '(') {
            out.push('<span class="tok-func">' + escapeHtml(word) + '</span>');
          } else {
            out.push(escapeHtml(word));
          }
          i = j;
        } else if (/[+\-*/%=<>!&|^~?:]/.test(code[i])) {
          let j = i;
          while (j < len && /[+\-*/%=<>!&|^~?:]/.test(code[j])) j++;
          out.push('<span class="tok-operator">' + escapeHtml(code.slice(i, j)) + '</span>');
          i = j;
        } else if (/[{}()\[\];,.]/.test(code[i])) {
          out.push('<span class="tok-punctuation">' + escapeHtml(code[i]) + '</span>');
          i++;
        } else {
          out.push(escapeHtml(code[i]));
          i++;
        }
      }
      return out.join('');
    },

    html: function (code) {
      const out = [];
      let i = 0;
      const len = code.length;
      while (i < len) {
        if (code.slice(i, i + 4) === '<!--') {
          let end = code.indexOf('-->', i + 4);
          end = end === -1 ? len : end + 3;
          out.push('<span class="tok-comment">' + escapeHtml(code.slice(i, end)) + '</span>');
          i = end;
        } else if (code[i] === '<' && (code[i + 1] === '/' || /[a-zA-Z!]/.test(code[i + 1] || ''))) {
          let j = i;
          let inStr = false;
          let strChar = '';
          while (j < len) {
            if (inStr) {
              if (code[j] === strChar) inStr = false;
            } else {
              if (code[j] === '"' || code[j] === "'") {
                inStr = true;
                strChar = code[j];
              } else if (code[j] === '>') {
                j++;
                break;
              }
            }
            j++;
          }
          const tag = code.slice(i, j);
          out.push(highlightHtmlTag(tag));
          i = j;
        } else if (code[i] === '<') {
          out.push(escapeHtml(code[i]));
          i++;
        } else {
          out.push(escapeHtml(code[i]));
          i++;
        }
      }
      return out.join('');
    },

    css: function (code) {
      const out = [];
      let i = 0;
      const len = code.length;
      while (i < len) {
        if (code[i] === '/' && code[i + 1] === '*') {
          let end = code.indexOf('*/', i + 2);
          end = end === -1 ? len : end + 2;
          out.push('<span class="tok-comment">' + escapeHtml(code.slice(i, end)) + '</span>');
          i = end;
        } else if (code[i] === '"' || code[i] === "'") {
          const q = code[i];
          let j = i + 1;
          while (j < len && code[j] !== q) {
            if (code[j] === '\\') j++;
            j++;
          }
          j = Math.min(j + 1, len);
          out.push('<span class="tok-string">' + escapeHtml(code.slice(i, j)) + '</span>');
          i = j;
        } else if (code[i] === '#' && /[a-zA-Z0-9]/.test(code[i + 1] || '')) {
          let j = i + 1;
          while (j < len && /[a-zA-Z0-9_-]/.test(code[j])) j++;
          out.push('<span class="tok-number">' + escapeHtml(code.slice(i, j)) + '</span>');
          i = j;
        } else if (/\d/.test(code[i])) {
          let j = i;
          while (j < len && /[0-9.%a-zA-Z]/.test(code[j])) j++;
          out.push('<span class="tok-number">' + escapeHtml(code.slice(i, j)) + '</span>');
          i = j;
        } else if (code[i] === '@') {
          let j = i + 1;
          while (j < len && /[a-zA-Z-]/.test(code[j])) j++;
          out.push('<span class="tok-keyword">' + escapeHtml(code.slice(i, j)) + '</span>');
          i = j;
        } else if (/[a-zA-Z_-]/.test(code[i])) {
          let j = i;
          while (j < len && /[a-zA-Z0-9_-]/.test(code[j])) j++;
          const word = code.slice(i, j);
          let k = j;
          while (k < len && /\s/.test(code[k])) k++;
          if (code[k] === ':') {
            out.push('<span class="tok-attr">' + escapeHtml(word) + '</span>');
          } else if (/^(important|inherit|initial|unset|none|auto|normal)$/.test(word)) {
            out.push('<span class="tok-keyword">' + escapeHtml(word) + '</span>');
          } else {
            out.push(escapeHtml(word));
          }
          i = j;
        } else if (/[{}();:,]/.test(code[i])) {
          out.push('<span class="tok-punctuation">' + escapeHtml(code[i]) + '</span>');
          i++;
        } else {
          out.push(escapeHtml(code[i]));
          i++;
        }
      }
      return out.join('');
    },

    py: function (code) {
      const out = [];
      let i = 0;
      const len = code.length;
      while (i < len) {
        if (code[i] === '#') {
          let end = code.indexOf('\n', i);
          if (end === -1) end = len;
          out.push('<span class="tok-comment">' + escapeHtml(code.slice(i, end)) + '</span>');
          i = end;
        } else if (code.slice(i, i + 3) === '"""' || code.slice(i, i + 3) === "'''") {
          const q = code.slice(i, i + 3);
          let end = code.indexOf(q, i + 3);
          end = end === -1 ? len : end + 3;
          out.push('<span class="tok-string">' + escapeHtml(code.slice(i, end)) + '</span>');
          i = end;
        } else if (code[i] === '"' || code[i] === "'") {
          const q = code[i];
          let j = i + 1;
          while (j < len && code[j] !== q) {
            if (code[j] === '\\') j++;
            j++;
          }
          j = Math.min(j + 1, len);
          out.push('<span class="tok-string">' + escapeHtml(code.slice(i, j)) + '</span>');
          i = j;
        } else if (/\d/.test(code[i])) {
          let j = i;
          while (j < len && /[0-9._eE]/.test(code[j])) j++;
          out.push('<span class="tok-number">' + escapeHtml(code.slice(i, j)) + '</span>');
          i = j;
        } else if (/[a-zA-Z_]/.test(code[i])) {
          let j = i;
          while (j < len && /[a-zA-Z0-9_]/.test(code[j])) j++;
          const word = code.slice(i, j);
          if (/^(def|class|if|elif|else|for|while|return|import|from|as|try|except|finally|raise|with|yield|lambda|pass|break|continue|and|or|not|is|in|True|False|None|global|nonlocal|assert|del|print)$/.test(word)) {
            out.push('<span class="tok-keyword">' + escapeHtml(word) + '</span>');
          } else if (i + word.length < len && code[i + word.length] === '(') {
            out.push('<span class="tok-func">' + escapeHtml(word) + '</span>');
          } else {
            out.push(escapeHtml(word));
          }
          i = j;
        } else if (/[+\-*/%=<>!&|^~@]/.test(code[i])) {
          let j = i;
          while (j < len && /[+\-*/%=<>!&|^~@]/.test(code[j])) j++;
          out.push('<span class="tok-operator">' + escapeHtml(code.slice(i, j)) + '</span>');
          i = j;
        } else if (/[{}()\[\];:,.]/.test(code[i])) {
          out.push('<span class="tok-punctuation">' + escapeHtml(code[i]) + '</span>');
          i++;
        } else {
          out.push(escapeHtml(code[i]));
          i++;
        }
      }
      return out.join('');
    },

    json: function (code) {
      const out = [];
      let i = 0;
      const len = code.length;
      while (i < len) {
        if (code[i] === '"') {
          let j = i + 1;
          while (j < len && code[j] !== '"') {
            if (code[j] === '\\') j++;
            j++;
          }
          j = Math.min(j + 1, len);
          let k = j;
          while (k < len && /\s/.test(code[k])) k++;
          if (code[k] === ':') {
            out.push('<span class="tok-attr">' + escapeHtml(code.slice(i, j)) + '</span>');
          } else {
            out.push('<span class="tok-string">' + escapeHtml(code.slice(i, j)) + '</span>');
          }
          i = j;
        } else if (/\d/.test(code[i]) || code[i] === '-') {
          let j = i;
          if (code[j] === '-') j++;
          while (j < len && /[0-9.]/.test(code[j])) j++;
          if (j < len && /[eE]/.test(code[j])) {
            j++;
            if (j < len && /[+-]/.test(code[j])) j++;
            while (j < len && /\d/.test(code[j])) j++;
          }
          out.push('<span class="tok-number">' + escapeHtml(code.slice(i, j)) + '</span>');
          i = j;
        } else if (code.slice(i, i + 4) === 'true' || code.slice(i, i + 5) === 'false' || code.slice(i, i + 4) === 'null') {
          const words = ['true', 'false', 'null'];
          for (const w of words) {
            if (code.slice(i, i + w.length) === w) {
              out.push('<span class="tok-keyword">' + escapeHtml(w) + '</span>');
              i += w.length;
              break;
            }
          }
        } else if (/[{}\[\]:,]/.test(code[i])) {
          out.push('<span class="tok-punctuation">' + escapeHtml(code[i]) + '</span>');
          i++;
        } else {
          out.push(escapeHtml(code[i]));
          i++;
        }
      }
      return out.join('');
    }
  };

  function highlightHtmlTag(tag) {
    let out = '<span class="tok-punctuation">&lt;</span>';
    let i = 1;
    if (tag[i] === '/') {
      out += '<span class="tok-punctuation">/</span>';
      i++;
    }
    let j = i;
    while (j < tag.length && /[a-zA-Z0-9-]/.test(tag[j])) j++;
    out += '<span class="tok-tag">' + escapeHtml(tag.slice(i, j)) + '</span>';
    i = j;
    while (i < tag.length && tag[i] !== '>') {
      if (/\s/.test(tag[i])) {
        out += tag[i];
        i++;
      } else if (tag[i] === '/' && tag[i + 1] === '>') {
        out += '<span class="tok-punctuation">/&gt;</span>';
        i += 2;
      } else if (tag[i] === '=') {
        out += '<span class="tok-punctuation">=</span>';
        i++;
      } else if (tag[i] === '"' || tag[i] === "'") {
        const q = tag[i];
        let k = i + 1;
        while (k < tag.length && tag[k] !== q) k++;
        k = Math.min(k + 1, tag.length);
        out += '<span class="tok-string">' + escapeHtml(tag.slice(i, k)) + '</span>';
        i = k;
      } else {
        j = i;
        while (j < tag.length && /[a-zA-Z0-9_-]/.test(tag[j])) j++;
        out += '<span class="tok-attr">' + escapeHtml(tag.slice(i, j)) + '</span>';
        i = j;
      }
    }
    if (i < tag.length && tag[i] === '>') {
      out += '<span class="tok-punctuation">&gt;</span>';
    }
    return out;
  }

  function detectLang(code) {
    const trimmed = code.trim();
    if (trimmed[0] === '{' || trimmed[0] === '[') {
      try { JSON.parse(trimmed); return 'json'; } catch (e) {}
    }
    if (/^\s*</.test(trimmed)) return 'html';
    if (/\bdef \w+\s*\(/.test(trimmed) || /\bimport \w+/.test(trimmed) || /\bfrom \w+ import/.test(trimmed)) return 'py';
    if (/\bfunction\s/.test(trimmed) || /\bconst\s+\w+\s*=/.test(trimmed) || /\blet\s+\w+\s*=/.test(trimmed)) return 'js';
    if (/[{]\s*\n?\s*[\w-]+\s*:/.test(trimmed) || /\.[\w-]+\s*\{/.test(trimmed)) return 'css';
    return 'js';
  }

  function highlightCode(code) {
    if (!codeMode) return escapeHtml(code);
    const lang = currentLang === 'auto' ? detectLang(code) : currentLang;
    const tokenizer = TOKENIZER[lang];
    if (!tokenizer) return escapeHtml(code);
    return tokenizer(code);
  }

  // ── Gutter ──

  function updateGutter() {
    const lines = textarea.value.split('\n').length;
    const current = gutter.children.length;
    if (lines === current) return;
    const frag = document.createDocumentFragment();
    for (let i = 1; i <= lines; i++) {
      const div = document.createElement('div');
      div.textContent = i;
      frag.appendChild(div);
    }
    gutter.replaceChildren(frag);
  }

  // ── Status Bar ──

  function updateStatus() {
    const v = textarea.value;
    const start = textarea.selectionStart;
    let line = 1;
    let col = 1;
    for (let i = 0; i < start && i < v.length; i++) {
      if (v[i] === '\n') { line++; col = 1; } else { col++; }
    }
    $('#cursor-pos').textContent = 'Ln ' + line + ', Col ' + col;
    const words = v.trim() ? v.trim().split(/\s+/).length : 0;
    $('#word-count').textContent = words + ' word' + (words !== 1 ? 's' : '');
    $('#char-count').textContent = v.length + ' char' + (v.length !== 1 ? 's' : '');
  }

  // ── Sync Scroll ──

  function syncScroll() {
    highlight.scrollTop = textarea.scrollTop;
    highlight.scrollLeft = textarea.scrollLeft;
    gutter.scrollTop = textarea.scrollTop;
  }

  // ── Render ──

  // a11y: <pre> highlight is aria-hidden, only visual. Screen readers read the textarea.
  function render() {
    hlCode.innerHTML = isShowingIntro() ? '' : highlightCode(textarea.value);
    updateGutter();
    updateStatus();
  }

  // ── Core Events ──

  textarea.addEventListener('input', function () {
    if (!hasContent) {
      hasContent = true;
      textarea.classList.remove('intro');
    }
    matchIndices = [];
    matchIdx = -1;
    render();
    autoSave();
  });

  textarea.addEventListener('paste', function (e) {
    if (!hasContent) {
      hasContent = true;
      textarea.classList.remove('intro');
      const text = e.clipboardData ? e.clipboardData.getData('text') : '';
      if (text) {
        e.preventDefault();
        textarea.value = text;
        textarea.setSelectionRange(text.length, text.length);
      } else {
        textarea.value = '';
      }
      render();
      autoSave();
    }
  });

  textarea.addEventListener('scroll', syncScroll);

  textarea.addEventListener('keyup', function () {
    updateStatus();
    autoSave();
  });

  textarea.addEventListener('click', function () {
    updateStatus();
  });

  // ── Tab / Enter ──

  textarea.addEventListener('keydown', function (e) {
    if (!hasContent && !e.ctrlKey && !e.metaKey && !e.altKey && (e.key.length === 1 || e.key === 'Backspace' || e.key === 'Delete' || e.key === 'Enter')) {
      hasContent = true;
      textarea.value = '';
      textarea.classList.remove('intro');
      render();
    }
    if (e.key === 'Tab' && !e.shiftKey) {
      e.preventDefault();
      insertText('  ');
    } else if (e.key === 'Enter' && codeMode) {
      e.preventDefault();
      const start = textarea.selectionStart;
      const val = textarea.value;
      const lineStart = val.lastIndexOf('\n', start - 1) + 1;
      const line = val.slice(lineStart, start);
      const indent = line.match(/^(\s*)/)[1];
      insertText('\n' + indent);
    } else if (e.key === '{') {
      e.preventDefault();
      if (textarea.selectionStart === textarea.selectionEnd && textarea.value[textarea.selectionStart] === '}') {
        textarea.selectionStart = textarea.selectionEnd = textarea.selectionStart + 1;
      } else {
        insertText('{}');
        textarea.selectionStart = textarea.selectionEnd = textarea.selectionStart - 1;
      }
    } else if (e.key === '(') {
      e.preventDefault();
      if (textarea.selectionStart === textarea.selectionEnd && textarea.value[textarea.selectionStart] === ')') {
        textarea.selectionStart = textarea.selectionEnd = textarea.selectionStart + 1;
      } else {
        insertText('()');
        textarea.selectionStart = textarea.selectionEnd = textarea.selectionStart - 1;
      }
    } else if (e.key === '[') {
      e.preventDefault();
      if (textarea.selectionStart === textarea.selectionEnd && textarea.value[textarea.selectionStart] === ']') {
        textarea.selectionStart = textarea.selectionEnd = textarea.selectionStart + 1;
      } else {
        insertText('[]');
        textarea.selectionStart = textarea.selectionEnd = textarea.selectionStart - 1;
      }
    } else if (e.key === '"' || e.key === "'") {
      e.preventDefault();
      if (textarea.selectionStart === textarea.selectionEnd && textarea.value[textarea.selectionStart] === e.key) {
        textarea.selectionStart = textarea.selectionEnd = textarea.selectionStart + 1;
      } else {
        insertText(e.key + e.key);
        textarea.selectionStart = textarea.selectionEnd = textarea.selectionStart - 1;
      }
    } else if (e.key === 'f' && (e.ctrlKey || e.metaKey) && !e.shiftKey) {
      e.preventDefault();
      openFindBar();
    } else if (e.key === 'Escape') {
      closeFindBar();
    } else if (e.key === 'F1') {
      e.preventDefault();
      openHelp();
    } else if (e.key === '/' && (e.ctrlKey || e.metaKey) && !e.shiftKey) {
      e.preventDefault();
      openHelp();
    } else if (e.key === 'z' && e.altKey && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      toggleWordWrap();
    } else if (e.key === 'z' && (e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey) {
      // native undo — let browser handle it
    } else if (e.key === 'z' && (e.ctrlKey || e.metaKey) && e.shiftKey) {
      // native redo — let browser handle it
    } else if (e.key === 'y' && (e.ctrlKey || e.metaKey)) {
      // native redo — let browser handle it
    } else if (e.key === 'Tab' && e.shiftKey) {
      e.preventDefault();
      dedentLine();
    }
  });

  function insertText(text) {
    if (!hasContent) {
      hasContent = true;
      textarea.value = '';
      textarea.classList.remove('intro');
    }
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    if (document.execCommand) {
      textarea.focus();
      document.execCommand('insertText', false, text);
    } else {
      textarea.value = textarea.value.slice(0, start) + text + textarea.value.slice(end);
      textarea.selectionStart = textarea.selectionEnd = start + text.length;
    }
    render();
    autoSave();
  }

  function dedentLine() {
    const start = textarea.selectionStart;
    const val = textarea.value;
    const lineStart = val.lastIndexOf('\n', start - 1) + 1;
    if (val.slice(lineStart, lineStart + 2) === '  ') {
      if (document.execCommand) {
        textarea.setSelectionRange(lineStart, lineStart + 2);
        textarea.focus();
        document.execCommand('delete', false);
      } else {
        textarea.value = val.slice(0, lineStart) + val.slice(lineStart + 2);
      }
      textarea.selectionStart = textarea.selectionEnd = Math.max(lineStart, start - 2);
      render();
      autoSave();
    }
  }

  // ── Theme ──

  function toggleTheme() {
    document.documentElement.classList.toggle('light');
    const isLight = document.documentElement.classList.contains('light');
    announce(isLight ? 'Light theme' : 'Dark theme');
    saveState();
  }

  // ── Code Mode ──

  function toggleCodeMode() {
    codeMode = !codeMode;
    const toggle = $('#toggle-codemode');
    toggle.classList.toggle('active', codeMode);
    toggle.setAttribute('aria-checked', String(codeMode));
    toggle.setAttribute('aria-label', codeMode ? 'Code mode on' : 'Code mode off');
    announce(codeMode ? 'Code mode on' : 'Code mode off');
    render();
    saveState();
  }

  // ── Find ──
  // a11y: track which element opened the findbar, return focus there on close

  function openFindBar() {
    lastFocusedElement = document.activeElement;
    findbar.hidden = false;
    findInput.focus();
    findInput.select();
  }

  function closeFindBar() {
    findbar.hidden = true;
    // a11y: return focus to the element that opened the findbar
    if (lastFocusedElement && lastFocusedElement.isConnected) {
      lastFocusedElement.focus();
    } else {
      textarea.focus();
    }
    findStatus.textContent = '';
  }

  function getMatches() {
    const query = findInput.value;
    if (!query) { matchIndices = []; matchIdx = -1; findStatus.textContent = ''; return; }
    const val = textarea.value;
    const useRegex = findRegex.checked;
    matchIndices = [];
    try {
      if (useRegex) {
        const re = new RegExp(query, 'gi');
        let m;
        while ((m = re.exec(val)) !== null) {
          matchIndices.push({ start: m.index, end: m.index + m[0].length });
          if (matchIndices.length > 10000) break;
        }
      } else {
        const lower = val.toLowerCase();
        const qLower = query.toLowerCase();
        let pos = 0;
        while ((pos = lower.indexOf(qLower, pos)) !== -1) {
          matchIndices.push({ start: pos, end: pos + query.length });
          pos++;
          if (matchIndices.length > 10000) break;
        }
      }
    } catch (e) {
      findStatus.textContent = 'Invalid regex';
      return;
    }
    if (matchIndices.length > 0) {
      matchIdx = 0;
      highlightMatch();
    } else {
      matchIdx = -1;
      findStatus.textContent = 'No matches';
    }
  }

  function highlightMatch(focusTextarea) {
    if (matchIdx >= 0 && matchIdx < matchIndices.length) {
      const m = matchIndices[matchIdx];
      textarea.setSelectionRange(m.start, m.end);
      if (focusTextarea) textarea.focus();
      findStatus.textContent = 'Match ' + (matchIdx + 1) + ' of ' + matchIndices.length;
    } else if (matchIndices.length > 0) {
      findStatus.textContent = matchIndices.length + ' match' + (matchIndices.length !== 1 ? 'es' : '');
    }
  }

  findInput.addEventListener('input', function () {
    getMatches();
  });

  findRegex.addEventListener('change', function () {
    getMatches();
  });

  $('#btn-find-next').addEventListener('click', function () {
    if (matchIndices.length === 0) return;
    matchIdx = (matchIdx + 1) % matchIndices.length;
    highlightMatch(true);
  });

  $('#btn-find-prev').addEventListener('click', function () {
    if (matchIndices.length === 0) return;
    matchIdx = (matchIdx - 1 + matchIndices.length) % matchIndices.length;
    highlightMatch(true);
  });

  $('#btn-find-close').addEventListener('click', closeFindBar);

  findInput.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') {
      e.shiftKey ? $('#btn-find-prev').click() : $('#btn-find-next').click();
    } else if (e.key === 'Escape') {
      closeFindBar();
    }
  });

  // ── Import ──

  const EXT_MAP = {
    js: 'js', jsx: 'js', ts: 'js', tsx: 'js',
    html: 'html', htm: 'html',
    css: 'css',
    py: 'py',
    json: 'json'
  };

  $('#btn-import').addEventListener('click', function () {
    fileInput.click();
  });

  fileInput.addEventListener('change', function () {
    const file = fileInput.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function () {
      textarea.select();
      hasContent = true;
      textarea.classList.remove('intro');
      if (document.execCommand) {
        textarea.focus();
        document.execCommand('selectAll', false);
        document.execCommand('insertText', false, reader.result);
      } else {
        textarea.value = reader.result;
      }
      const ext = file.name.split('.').pop().toLowerCase();
      if (EXT_MAP[ext]) {
        currentLang = EXT_MAP[ext];
        $('#sel-lang').value = currentLang;
      }
      textarea.setSelectionRange(0, 0);
      document.title = file.name + ' — Clean Editor';
      render();
      saveState();
    };
    reader.readAsText(file);
    fileInput.value = '';
  });

  // ── Download ──

  const LANG_EXT = { js: '.js', html: '.html', css: '.css', py: '.py', json: '.json', auto: '.txt' };

  function downloadFile() {
    const lang = currentLang === 'auto' ? detectLang(textarea.value) : currentLang;
    const ext = LANG_EXT[lang] || '.txt';
    const blob = new Blob([textarea.value], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'document' + ext;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // ── Clear ──
  // a11y: modal traps focus, returns focus to the clear button on close

  $('#btn-clear').addEventListener('click', function () {
    if (!textarea.value.trim()) return;
    lastFocusedElement = document.activeElement;
    modal.hidden = false;
    $('#btn-confirm-yes').focus();
  });

  $('#btn-confirm-yes').addEventListener('click', function () {
    textarea.select();
    if (document.execCommand) {
      textarea.focus();
      document.execCommand('selectAll', false);
      document.execCommand('insertText', false, INTRO_TEXT);
    } else {
      textarea.value = INTRO_TEXT;
    }
    hasContent = false;
    textarea.classList.add('intro');
    modal.hidden = true;
    textarea.focus();
    render();
    saveState();
  });

  $('#btn-confirm-no').addEventListener('click', function () {
    modal.hidden = true;
    // a11y: return focus to the button that opened the modal
    if (lastFocusedElement && lastFocusedElement.isConnected) {
      lastFocusedElement.focus();
    } else {
      textarea.focus();
    }
  });

  modal.querySelector('.modal-backdrop').addEventListener('click', function () {
    modal.hidden = true;
    if (lastFocusedElement && lastFocusedElement.isConnected) {
      lastFocusedElement.focus();
    } else {
      textarea.focus();
    }
  });

  // a11y: keyboard trap inside modal — Tab cycles between Cancel and Clear only
  modal.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      modal.hidden = true;
      if (lastFocusedElement && lastFocusedElement.isConnected) {
        lastFocusedElement.focus();
      } else {
        textarea.focus();
      }
    } else if (e.key === 'Tab') {
      const focusable = [$('#btn-confirm-no'), $('#btn-confirm-yes')];
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  });

  // ── Toolbar Buttons ──

  $('#btn-theme').addEventListener('click', toggleTheme);
  const toggleCodemode = $('#toggle-codemode');
  toggleCodemode.addEventListener('click', toggleCodeMode);
  $('#btn-find').addEventListener('click', function () { openFindBar(); });
  $('#btn-download').addEventListener('click', downloadFile);

  // ── Toolbar roving tabindex ──
  // Arrow keys move focus between toolbar buttons (WCAG APG toolbar pattern)

  const toolbar = $('.toolbar');
  const toolbarItems = Array.from(toolbar.querySelectorAll('button, select'));

  function initToolbarRoving() {
    toolbarItems.forEach(function (el, idx) {
      el.setAttribute('tabindex', idx === 0 ? '0' : '-1');
    });
  }

  toolbar.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      const cur = toolbarItems.indexOf(document.activeElement);
      if (cur === -1) return;
      const dir = e.key === 'ArrowRight' ? 1 : -1;
      const next = (cur + dir + toolbarItems.length) % toolbarItems.length;
      toolbarItems[cur].setAttribute('tabindex', '-1');
      toolbarItems[next].setAttribute('tabindex', '0');
      toolbarItems[next].focus();
    } else if (e.key === 'Home') {
      e.preventDefault();
      toolbarItems.forEach(function (el) { el.setAttribute('tabindex', '-1'); });
      toolbarItems[0].setAttribute('tabindex', '0');
      toolbarItems[0].focus();
    } else if (e.key === 'End') {
      e.preventDefault();
      toolbarItems.forEach(function (el) { el.setAttribute('tabindex', '-1'); });
      toolbarItems[toolbarItems.length - 1].setAttribute('tabindex', '0');
      toolbarItems[toolbarItems.length - 1].focus();
    }
  });

  initToolbarRoving();

  // ── Word wrap toggle ──

  let wordWrap = false;

  function toggleWordWrap() {
    wordWrap = !wordWrap;
    document.getElementById('app').classList.toggle('word-wrap', wordWrap);
    $('#btn-wrap').setAttribute('aria-pressed', String(wordWrap));
    announce(wordWrap ? 'Word wrap on' : 'Word wrap off');
    try { localStorage.setItem(STORAGE + 'wordwrap', String(wordWrap)); } catch (e) {}
  }

  $('#btn-wrap').addEventListener('click', toggleWordWrap);

  // ── Help Modal ──

  const helpModal = $('#help-modal');

  function openHelp() {
    lastFocusedElement = document.activeElement;
    helpModal.hidden = false;
    $('#btn-help-close').focus();
  }

  function closeHelp() {
    helpModal.hidden = true;
    if (lastFocusedElement && lastFocusedElement.isConnected) {
      lastFocusedElement.focus();
    } else {
      textarea.focus();
    }
  }

  $('#btn-help-close').addEventListener('click', closeHelp);
  helpModal.querySelector('.modal-backdrop').addEventListener('click', closeHelp);

  helpModal.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { closeHelp(); }
    else if (e.key === 'Tab') {
      const btn = $('#btn-help-close');
      if (document.activeElement !== btn) { e.preventDefault(); btn.focus(); }
    }
  });

  // ── Info Modal ──
  // a11y: same focus management as clear modal

  const infoModal = $('#info-modal');

  $('#btn-info').addEventListener('click', function () {
    lastFocusedElement = document.activeElement;
    infoModal.hidden = false;
    $('#btn-info-close').focus();
  });

  $('#btn-info-close').addEventListener('click', function () {
    infoModal.hidden = true;
    if (lastFocusedElement && lastFocusedElement.isConnected) {
      lastFocusedElement.focus();
    } else {
      textarea.focus();
    }
  });

  infoModal.querySelector('.modal-backdrop').addEventListener('click', function () {
    infoModal.hidden = true;
    if (lastFocusedElement && lastFocusedElement.isConnected) {
      lastFocusedElement.focus();
    } else {
      textarea.focus();
    }
  });

  // a11y: keyboard trap inside info modal — Tab cycles between Close and GitHub link
  infoModal.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      infoModal.hidden = true;
      if (lastFocusedElement && lastFocusedElement.isConnected) {
        lastFocusedElement.focus();
      } else {
        textarea.focus();
      }
    } else if (e.key === 'Tab') {
      const focusable = [$('#btn-info-close'), infoModal.querySelector('.info-link')].filter(Boolean);
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  });

  $('#sel-lang').addEventListener('change', function () {
    currentLang = this.value;
    document.documentElement.lang = currentLang === 'py' ? 'python' : currentLang === 'auto' ? 'en' : currentLang;
    render();
    saveState();
  });

  // ── Init ──

  loadState();
  if (!hasContent) textarea.classList.add('intro');
  if (codeMode) {
    const toggleEl = $('#toggle-codemode');
    toggleEl.classList.add('active');
    toggleEl.setAttribute('aria-checked', 'true');
    toggleEl.setAttribute('aria-label', 'Code mode on');
  }
  // Restore word wrap
  const savedWrap = localStorage.getItem(STORAGE + 'wordwrap');
  if (savedWrap === 'true') {
    wordWrap = true;
    document.getElementById('app').classList.add('word-wrap');
    $('#btn-wrap').setAttribute('aria-pressed', 'true');
  }
  // Restore html lang
  document.documentElement.lang = currentLang === 'py' ? 'python' : currentLang === 'auto' ? 'en' : currentLang;
  render();
  requestAnimationFrame(function () {
    requestAnimationFrame(function () {
      $('#toggle-codemode').classList.add('toggle-ready');
    });
  });

})();
