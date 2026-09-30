/**
 * paragraphFormat.js — paragraph-level formatting for the Home ribbon.
 *
 * Adds these attributes to every paragraph and heading (saved in the HTML):
 *   indent      0–8 steps of 0.5 inch     → data-indent + margin-left
 *   lineHeight  "1", "1.15", "1.5", "2"…  → line-height
 *   spacing     "none" = No Spacing style → data-spacing
 *   styleName   "title" | "subtitle"      → data-style
 *   border      "bottom" | "top" | "box"  → data-border
 *
 * Commands:
 *   editor.commands.setBlockAttributes({ lineHeight: '1.5' })
 *   editor.commands.changeIndent(1)   // or -1
 *
 * Plus two text helpers used by the ribbon: changeCase() and sortBlocks().
 */
import { Extension } from '@tiptap/core';

const BLOCK_TYPES = ['paragraph', 'heading'];
const SEPARATOR = '\uE000'; // a private-use character that never appears in normal text
const MAX_INDENT = 8;

export const ParagraphFormat = Extension.create({
  name: 'paragraphFormat',

  addGlobalAttributes() {
    return [{
      types: BLOCK_TYPES,
      attributes: {
        indent: {
          default: 0,
          parseHTML: (element) => Number(element.getAttribute('data-indent')) || 0,
          renderHTML: (attrs) => (attrs.indent
            ? { 'data-indent': attrs.indent, style: `margin-left: ${attrs.indent * 0.5}in` }
            : {}),
        },
        lineHeight: {
          default: null,
          parseHTML: (element) => element.style.lineHeight || null,
          renderHTML: (attrs) => (attrs.lineHeight ? { style: `line-height: ${attrs.lineHeight}` } : {}),
        },
        spacing: {
          default: null,
          parseHTML: (element) => element.getAttribute('data-spacing'),
          renderHTML: (attrs) => (attrs.spacing ? { 'data-spacing': attrs.spacing } : {}),
        },
        styleName: {
          default: null,
          parseHTML: (element) => element.getAttribute('data-style'),
          renderHTML: (attrs) => (attrs.styleName ? { 'data-style': attrs.styleName } : {}),
        },
        border: {
          default: null,
          parseHTML: (element) => element.getAttribute('data-border'),
          renderHTML: (attrs) => (attrs.border ? { 'data-border': attrs.border } : {}),
        },
      },
    }];
  },

  addCommands() {
    const eachBlock = (state, callback) => {
      const { from, to } = state.selection;
      state.doc.nodesBetween(from, to, (node, pos) => {
        if (BLOCK_TYPES.includes(node.type.name)) callback(node, pos);
      });
    };
    return {
      setBlockAttributes: (attrs) => ({ state, tr, dispatch }) => {
        let changed = false;
        eachBlock(state, (node, pos) => {
          changed = true;
          if (dispatch) tr.setNodeMarkup(pos, undefined, { ...node.attrs, ...attrs });
        });
        return changed;
      },
      changeIndent: (delta) => ({ state, tr, dispatch }) => {
        let changed = false;
        eachBlock(state, (node, pos) => {
          const indent = Math.max(0, Math.min(MAX_INDENT, (node.attrs.indent || 0) + delta));
          if (indent === (node.attrs.indent || 0)) return;
          changed = true;
          if (dispatch) tr.setNodeMarkup(pos, undefined, { ...node.attrs, indent });
        });
        return changed;
      },
    };
  },
});

const CASES = {
  sentence: (text) => text.toLowerCase().replace(/(^\s*\p{L}|[.!?]\s+\p{L})/gu, (m) => m.toUpperCase()),
  lower: (text) => text.toLowerCase(),
  upper: (text) => text.toUpperCase(),
  title: (text) => text.toLowerCase().replace(/(^|\s|[-(“"'])(\p{L})/gu, (m, lead, letter) => lead + letter.toUpperCase()),
  toggle: (text) => [...text].map((c) => (c === c.toUpperCase() ? c.toLowerCase() : c.toUpperCase())).join(''),
};

/** Changes the case of the selected text, keeping its formatting. Returns false if nothing is selected. */
export function changeCase(editor, mode) {
  const { state } = editor;
  const { from, to, empty } = state.selection;
  const convert = CASES[mode];
  if (empty || !convert) return false;

  // Sentence case needs to see where sentences start, so convert the whole selection's text at once.
  const pieces = [];
  state.doc.nodesBetween(from, to, (node, pos) => {
    if (!node.isText) return;
    const start = Math.max(from, pos);
    const end = Math.min(to, pos + node.nodeSize);
    pieces.push({ start, end, text: node.text.slice(start - pos, end - pos), marks: node.marks });
  });
  const joined = convert(pieces.map((p) => p.text).join(SEPARATOR));
  const converted = joined.split(SEPARATOR);

  const { tr } = state;
  [...pieces].reverse().forEach((piece, reverseIndex) => {
    const text = converted[pieces.length - 1 - reverseIndex] ?? piece.text;
    if (text && text !== piece.text) tr.replaceWith(piece.start, piece.end, state.schema.text(text, piece.marks));
  });
  if (!tr.docChanged) return true;
  editor.view.dispatch(tr);
  return true;
}

/**
 * Sorts the selected paragraphs A→Z (or the items of the list the cursor is in).
 * Returns a message for the user.
 */
export function sortBlocks(editor, direction = 'asc') {
  const { state } = editor;
  const { $from, $to } = state.selection;
  const compare = (a, b) => {
    const order = a.textContent.localeCompare(b.textContent, undefined, { sensitivity: 'base', numeric: true });
    return direction === 'asc' ? order : -order;
  };

  // Inside a list: sort that list's items.
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    const node = $from.node(depth);
    if (['bulletList', 'orderedList', 'taskList'].includes(node.type.name)) {
      const items = [];
      node.forEach((child) => items.push(child));
      if (items.length < 2) return 'The list needs at least two items to sort.';
      const start = $from.before(depth) + 1;
      const tr = state.tr.replaceWith(start, start + node.content.size, [...items].sort(compare));
      editor.view.dispatch(tr);
      return `Sorted ${items.length} list items`;
    }
  }

  // Otherwise: sort the top-level paragraphs the selection touches.
  const start = $from.depth ? $from.before(1) : 0; // depth 0 = whole document selected
  const end = $to.depth ? $to.after(1) : state.doc.content.size;
  const blocks = [];
  state.doc.nodesBetween(start, end, (node, pos, parent) => {
    if (parent === state.doc) {
      blocks.push(node);
      return false;
    }
    return true;
  });
  if (blocks.length < 2) return 'Select two or more paragraphs to sort.';
  editor.view.dispatch(state.tr.replaceWith(start, end, [...blocks].sort(compare)));
  return `Sorted ${blocks.length} paragraphs`;
}
