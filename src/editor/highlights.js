/**
 * highlights.js — coloured marks drawn over the text without changing it.
 *
 * Highlights are ProseMirror "decorations": they are painted on screen but
 * are never saved into the document. Each set belongs to a named group, so
 * the find bar ("find") and, later, the analysis engine ("issues") can each
 * replace their own marks without touching the other's.
 *
 *   editor.commands.setHighlights('find', [{ from, to, className }])
 *   editor.commands.setHighlights('issues', [{ from, to, className: 'editor-heatmap-mark heatmap-contradiction', id: 'issue-1' }])
 *   editor.commands.clearHighlights('find')
 *
 * Marks follow the text as the user types (their positions are mapped
 * through every edit). Clicking a mark that has an `id` calls the
 * `onHighlightClick(id, group)` option. Hovering one calls
 * `onHighlightHover(id, group, rect)` — `rect` is the hovered word's own
 * bounding box, in viewport coordinates, for positioning a popover next to
 * it; hovering away from every mark calls it with `null`.
 */
import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

export const highlightsKey = new PluginKey('documendHighlights');

function combine(doc, groups) {
  return DecorationSet.create(doc, Object.values(groups).flatMap((set) => set.find()));
}

export const DocumentHighlights = Extension.create({
  name: 'documendHighlights',

  addOptions() {
    return { onHighlightClick: null, onHighlightHover: null };
  },

  addCommands() {
    return {
      setHighlights: (group, ranges) => ({ tr, dispatch }) => {
        if (dispatch) tr.setMeta(highlightsKey, { group, ranges });
        return true;
      },
      clearHighlights: (group) => ({ tr, dispatch }) => {
        if (dispatch) tr.setMeta(highlightsKey, { group, ranges: [] });
        return true;
      },
    };
  },

  addProseMirrorPlugins() {
    const extension = this;
    return [
      new Plugin({
        key: highlightsKey,
        state: {
          init: (_config, state) => ({ groups: {}, all: DecorationSet.create(state.doc, []) }),
          apply(tr, value) {
            const meta = tr.getMeta(highlightsKey);
            if (!meta && !tr.docChanged) return value;

            let groups = value.groups;
            if (tr.docChanged) {
              groups = Object.fromEntries(
                Object.entries(groups).map(([name, set]) => [name, set.map(tr.mapping, tr.doc)]),
              );
            }
            if (meta) {
              const size = tr.doc.content.size;
              const decorations = meta.ranges
                .filter((range) => range.from >= 0 && range.to <= size && range.to > range.from)
                .map((range) => Decoration.inline(
                  range.from,
                  range.to,
                  {
                    class: range.className || 'editor-find-match',
                    ...(range.id ? { 'data-highlight-id': range.id } : {}),
                  },
                  { id: range.id ?? null, group: meta.group },
                ));
              groups = { ...groups, [meta.group]: DecorationSet.create(tr.doc, decorations) };
            }
            return { groups, all: combine(tr.doc, groups) };
          },
        },
        props: {
          decorations(state) {
            return highlightsKey.getState(state).all;
          },
          handleClick(view, pos) {
            const onClick = extension.options.onHighlightClick;
            if (!onClick) return false;
            const hit = highlightsKey.getState(view.state).all.find(pos, pos).find((d) => d.spec.id);
            if (hit) onClick(hit.spec.id, hit.spec.group);
            return false; // still let the cursor move there
          },
          handleDOMEvents: {
            mousemove(view, event) {
              const onHover = extension.options.onHighlightHover;
              if (!onHover) return false;
              const marked = event.target.closest?.('[data-highlight-id]');
              if (!marked) {
                onHover(null);
                return false;
              }
              const pos = view.posAtCoords({ left: event.clientX, top: event.clientY });
              const hit = pos && highlightsKey.getState(view.state).all.find(pos.pos, pos.pos).find((d) => d.spec.id);
              if (hit) onHover(hit.spec.id, hit.spec.group, marked.getBoundingClientRect());
              else onHover(null);
              return false;
            },
            mouseleave(view) {
              extension.options.onHighlightHover?.(null);
              return false;
            },
          },
        },
      }),
    ];
  },
});

/** Every case-insensitive match of `query` inside the document's text, as { from, to }. */
export function findRanges(doc, query) {
  const needle = (query || '').toLowerCase();
  if (!needle) return [];
  const ranges = [];
  doc.descendants((node, pos) => {
    if (!node.isText) return;
    const text = node.text.toLowerCase();
    let index = text.indexOf(needle);
    while (index !== -1) {
      ranges.push({ from: pos + index, to: pos + index + needle.length });
      index = text.indexOf(needle, index + needle.length);
    }
  });
  return ranges;
}

/** Replaces every match of `query` with `replacement` in one undoable step. Returns how many were replaced. */
export function replaceAll(editor, query, replacement) {
  const ranges = findRanges(editor.state.doc, query);
  if (!ranges.length) return 0;
  const { tr } = editor.state;
  [...ranges].reverse().forEach(({ from, to }) => {
    if (replacement) tr.insertText(replacement, from, to);
    else tr.delete(from, to);
  });
  editor.view.dispatch(tr);
  return ranges.length;
}
