/**
 * HomeRibbon — the editor's Home tab, laid out like a desktop word processor:
 *
 *   Clipboard  Paste ▾ · Cut · Copy · Format Painter
 *   Font       font · size · grow · shrink · change case ▾ · clear formatting
 *              B I U S x₂ x² · highlight ▾ · font colour ▾
 *   Paragraph  bullets · numbering · checklist · indent − + · sort · ¶
 *              align L C R J · line spacing ▾ · shading ▾ · borders ▾
 *   Styles     Normal · No Spacing · Heading 1–3 · Title · Subtitle · Quote
 *   Editing    Find · Replace · Select ▾
 *
 * Every control is wired to a real Tiptap command. Buttons use
 * onMouseDown + preventDefault so the text selection stays put while you
 * click. Dropdowns are fixed-position popovers so the scrolling ribbon
 * can't clip them.
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useEditorState } from '@tiptap/react';
import {
  AArrowDown,
  AArrowUp,
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  ArrowDownAZ,
  ArrowUpDown,
  Baseline,
  Bold,
  CaseSensitive,
  Check,
  ChevronDown,
  ClipboardPaste,
  Copy,
  Highlighter,
  IndentDecrease,
  IndentIncrease,
  Italic,
  List,
  ListChecks,
  ListOrdered,
  MousePointer2,
  PaintBucket,
  Paintbrush,
  Pilcrow,
  RemoveFormatting,
  Replace,
  Scissors,
  Search,
  Square,
  Strikethrough,
  Subscript,
  Superscript,
  Underline,
} from 'lucide-react';
import { changeCase, sortBlocks } from './paragraphFormat';
import './home-ribbon.css';

/* ==========================================================================
   Options
   ========================================================================== */

const DEFAULT_FONT = 'Georgia';
const DEFAULT_SIZE = 12; // pt — matches the page's base size in editor.css

const FONTS = [
  'Georgia',
  'Times New Roman',
  'Cambria',
  'Garamond',
  'Calibri',
  'Arial',
  'Segoe UI',
  'Verdana',
  'Tahoma',
  'Trebuchet MS',
  'DM Sans',
  'Courier New',
];

const SIZES = [8, 9, 10, 10.5, 11, 12, 14, 16, 18, 20, 22, 24, 26, 28, 36, 48, 72];

const LINE_SPACINGS = ['1', '1.15', '1.5', '2', '2.5', '3'];

const CASE_OPTIONS = [
  { id: 'sentence', label: 'Sentence case.' },
  { id: 'lower', label: 'lowercase' },
  { id: 'upper', label: 'UPPERCASE' },
  { id: 'title', label: 'Capitalize Each Word' },
  { id: 'toggle', label: 'tOGGLE cASE' },
];

const BORDER_OPTIONS = [
  { id: 'bottom', label: 'Bottom border' },
  { id: 'top', label: 'Top border' },
  { id: 'box', label: 'Outside borders' },
  { id: null, label: 'No border' },
];

const STYLES = [
  { id: 'normal', label: 'Normal' },
  { id: 'nospacing', label: 'No Spacing' },
  { id: 'h1', label: 'Heading 1' },
  { id: 'h2', label: 'Heading 2' },
  { id: 'h3', label: 'Heading 3' },
  { id: 'title', label: 'Title' },
  { id: 'subtitle', label: 'Subtitle' },
  { id: 'quote', label: 'Quote' },
];

/** Mixes a hex colour with white (amount > 0) or black (amount < 0). */
function mix(hex, amount) {
  const n = parseInt(hex.slice(1), 16);
  const target = amount > 0 ? 255 : 0;
  const t = Math.abs(amount);
  const channel = (shift) => Math.round(((n >> shift) & 255) * (1 - t) + target * t);
  return `#${[16, 8, 0].map((shift) => channel(shift).toString(16).padStart(2, '0')).join('')}`;
}

const THEME_COLORS = ['#ffffff', '#000000', '#f3eee3', '#172d26', '#21483b', '#d8a53c', '#7caa91', '#c86f52', '#75558c', '#4e91a2'];
const THEME_GRID = [0, 0.8, 0.6, 0.4, -0.25, -0.5].map((amount, row) => THEME_COLORS.map((color, column) => {
  if (row === 0) return color;
  if (column === 0) return mix('#ffffff', -[0, 0.05, 0.15, 0.25, 0.35, 0.5][row]); // greys under white
  if (column === 1) return mix('#000000', [0, 0.5, 0.35, 0.25, 0.15, 0.05][row]); // greys under black
  return mix(color, amount);
}));
const STANDARD_COLORS = ['#c00000', '#ff0000', '#ffc000', '#ffff00', '#92d050', '#00b050', '#00b0f0', '#0070c0', '#002060', '#7030a0'];
const HIGHLIGHT_COLORS = [
  '#ffff00', '#00ff00', '#00ffff', '#ff00ff', '#4f81ff',
  '#ff4d4d', '#1f3a93', '#008080', '#008000', '#800080',
  '#800000', '#808000', '#808080', '#c0c0c0', '#000000',
];

/** "14pt" → 14, "16px" → 12, missing → DEFAULT_SIZE */
function sizeInPoints(value) {
  if (!value) return DEFAULT_SIZE;
  const number = parseFloat(value);
  if (Number.isNaN(number)) return DEFAULT_SIZE;
  return /px$/.test(value) ? Math.round(number * 0.75 * 2) / 2 : number;
}

const keep = (event) => event.preventDefault(); // keep the editor's selection when clicking a control

/** The editor's DOM element, or null before the page has mounted it. */
function editorDom(editor) {
  try {
    return editor?.view?.dom ?? null;
  } catch {
    return null;
  }
}

/* ==========================================================================
   Building blocks
   ========================================================================== */

/**
 * A dropdown whose panel is rendered into <body> (so no scrolling or
 * transformed parent can clip or shift it) and placed under its trigger.
 */
function RibbonMenu({ trigger, title, className = '', panelClassName = '', width = 220, disabled = false, children }) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState(null);
  const buttonRef = useRef(null);
  const panelRef = useRef(null);

  useLayoutEffect(() => {
    if (!open || !buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8));
    const dark = Boolean(buttonRef.current.closest('.dash-dark'));
    setPosition({ top: rect.bottom + 4, left, dark });
  }, [open, width]);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (event) => {
      if (panelRef.current?.contains(event.target) || buttonRef.current?.contains(event.target)) return;
      setOpen(false);
    };
    const onKey = (event) => { if (event.key === 'Escape') setOpen(false); };
    const onMove = (event) => {
      if (event?.target instanceof Node && panelRef.current?.contains(event.target)) return; // scrolling inside the list
      setOpen(false);
    };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    window.addEventListener('resize', onMove);
    window.addEventListener('scroll', onMove, true);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onMove);
      window.removeEventListener('scroll', onMove, true);
    };
  }, [open]);

  const close = () => setOpen(false);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className={`hr-btn ${className} ${open ? 'is-open' : ''}`}
        title={title}
        aria-label={title}
        aria-haspopup="true"
        aria-expanded={open}
        disabled={disabled}
        onMouseDown={keep}
        onClick={() => setOpen((value) => !value)}
      >
        {trigger}
      </button>
      {open && position && createPortal(
        <div
          ref={panelRef}
          className={`hr-menu ${panelClassName} ${position.dark ? 'hr-menu-dark' : ''}`}
          style={{ top: position.top, left: position.left, width }}
          role="menu"
          onMouseDown={(event) => { if (event.target.tagName !== 'INPUT') keep(event); }}
        >
          {children(close)}
        </div>,
        document.body,
      )}
    </>
  );
}

function IconButton({ icon: Icon, title, onClick, active = false, disabled = false, size = 16 }) {
  return (
    <button
      type="button"
      className={`hr-btn hr-icon ${active ? 'is-active' : ''}`}
      title={title}
      aria-label={title}
      aria-pressed={active}
      disabled={disabled}
      onMouseDown={keep}
      onClick={onClick}
    >
      <Icon size={size} strokeWidth={active ? 2.3 : 1.8} />
    </button>
  );
}

function LabelButton({ icon: Icon, label, title, onClick, active = false }) {
  return (
    <button
      type="button"
      className={`hr-btn hr-labelled ${active ? 'is-active' : ''}`}
      title={title ?? label}
      aria-pressed={active}
      onMouseDown={keep}
      onClick={onClick}
    >
      <Icon size={15} strokeWidth={1.8} />
      <span>{label}</span>
    </button>
  );
}

function MenuItem({ label, onClick, checked = false, style }) {
  return (
    <button type="button" role="menuitemradio" aria-checked={checked} className="hr-menu-item" onClick={onClick} style={style}>
      <span className="hr-menu-check">{checked && <Check size={13} />}</span>
      <span>{label}</span>
    </button>
  );
}

function ColorGrid({ onPick, onClear, clearLabel, current, highlight = false }) {
  const swatch = (color) => (
    <button
      key={color}
      type="button"
      className={`hr-swatch ${current && current.toLowerCase() === color ? 'is-current' : ''}`}
      style={{ background: color }}
      title={color}
      aria-label={`Colour ${color}`}
      onClick={() => onPick(color)}
    />
  );
  return (
    <div className="hr-colors">
      <button type="button" className="hr-menu-item hr-color-clear" onClick={onClear}>
        <span className={`hr-swatch hr-swatch-none ${highlight ? '' : 'is-auto'}`} aria-hidden="true" />
        <span>{clearLabel}</span>
      </button>
      {highlight ? (
        <div className="hr-swatch-grid hr-swatch-grid-5">{HIGHLIGHT_COLORS.map(swatch)}</div>
      ) : (
        <>
          <p className="hr-menu-heading">Theme colours</p>
          <div className="hr-swatch-grid">{THEME_GRID.flat().map(swatch)}</div>
          <p className="hr-menu-heading">Standard colours</p>
          <div className="hr-swatch-grid">{STANDARD_COLORS.map(swatch)}</div>
        </>
      )}
    </div>
  );
}

function Group({ label, className = '', children }) {
  return (
    <section className={`hr-group ${className}`} aria-label={label}>
      <div className="hr-group-body">{children}</div>
      <span className="hr-group-label">{label}</span>
    </section>
  );
}

/* ==========================================================================
   The ribbon
   ========================================================================== */

export default function HomeRibbon({ editor, canEdit, announce, onFind, onReplace }) {
  const [highlightColor, setHighlightColor] = useState('#ffff00');
  const [fontColor, setFontColor] = useState('#c00000');
  const [shadingColor, setShadingColor] = useState('#f4d995');
  const [sizeDraft, setSizeDraft] = useState(null);
  const [painter, setPainter] = useState(null); // formatting copied by Format Painter
  const [showMarks, setShowMarks] = useState(false);

  // What the cursor is sitting in, so the controls can show it.
  const state = useEditorState({
    editor,
    selector: ({ editor: e }) => {
      if (!e) return null;
      const textStyle = e.getAttributes('textStyle');
      const block = e.state.selection.$from.parent;
      let style = 'normal';
      if (e.isActive('blockquote')) style = 'quote';
      else if (block.type.name === 'heading') style = `h${block.attrs.level}`;
      else if (block.attrs.styleName) style = block.attrs.styleName;
      else if (block.attrs.spacing === 'none') style = 'nospacing';
      return {
        font: textStyle.fontFamily ? textStyle.fontFamily.split(',')[0].replace(/['"]/g, '').trim() : DEFAULT_FONT,
        size: sizeInPoints(textStyle.fontSize),
        color: textStyle.color ?? null,
        bold: e.isActive('bold'),
        italic: e.isActive('italic'),
        underline: e.isActive('underline'),
        strike: e.isActive('strike'),
        subscript: e.isActive('subscript'),
        superscript: e.isActive('superscript'),
        bulletList: e.isActive('bulletList'),
        orderedList: e.isActive('orderedList'),
        taskList: e.isActive('taskList'),
        align: ['center', 'right', 'justify'].find((a) => e.isActive({ textAlign: a })) ?? 'left',
        lineHeight: block.attrs.lineHeight ?? null,
        border: block.attrs.border ?? null,
        style,
      };
    },
  }) ?? { font: DEFAULT_FONT, size: DEFAULT_SIZE, align: 'left', style: 'normal' };

  // Format Painter: after copying, the next selection you make gets the formatting.
  useEffect(() => {
    const dom = editorDom(editor);
    if (!dom || !painter) return undefined;
    const apply = () => window.setTimeout(() => {
      if (editor.state.selection.empty) return;
      const chain = editor.chain().focus().unsetAllMarks();
      painter.marks.forEach((mark) => chain.setMark(mark.type, mark.attrs));
      if (painter.align) chain.setTextAlign(painter.align);
      chain.run();
      setPainter(null);
      announce('Formatting applied');
    }, 0);
    const cancel = (event) => { if (event.key === 'Escape') setPainter(null); };
    dom.classList.add('is-format-painting');
    dom.addEventListener('mouseup', apply);
    window.addEventListener('keydown', cancel);
    return () => {
      dom.classList.remove('is-format-painting');
      dom.removeEventListener('mouseup', apply);
      window.removeEventListener('keydown', cancel);
    };
  }, [editor, painter, announce]);

  // Show/hide ¶ marks.
  useEffect(() => {
    editorDom(editor)?.classList.toggle('show-formatting-marks', showMarks);
  }, [editor, showMarks]);

  /** Runs a command chain on the selection, if a document is open. */
  const run = (build) => {
    if (!canEdit()) {
      announce('Open or create a document first.');
      return;
    }
    const chain = editor.chain().focus();
    build(chain);
    chain.run();
  };

  const setSize = (points) => {
    const value = Math.max(1, Math.min(400, Number(points)));
    if (!value) return;
    run((c) => c.setFontSize(`${value}pt`));
    setSizeDraft(null);
  };

  const stepSize = (direction) => {
    const current = state.size ?? DEFAULT_SIZE;
    const next = direction > 0
      ? SIZES.find((size) => size > current) ?? Math.min(400, current + 10)
      : [...SIZES].reverse().find((size) => size < current) ?? Math.max(1, current - 1);
    setSize(next);
  };

  // --- Clipboard ---
  const clipboardCommand = (command) => {
    if (!canEdit()) {
      announce('Open or create a document first.');
      return;
    }
    editor.view.focus();
    // execCommand('cut'/'copy') goes through the editor's own clipboard handling, so formatting is kept.
    const ok = document.execCommand(command);
    if (!ok) announce(`Press Ctrl+${command === 'cut' ? 'X' : 'C'} to ${command}.`);
  };

  const paste = async (plainOnly = false) => {
    if (!canEdit()) {
      announce('Open or create a document first.');
      return;
    }
    try {
      if (!plainOnly && navigator.clipboard?.read) {
        const items = await navigator.clipboard.read();
        for (const item of items) {
          if (item.types.includes('text/html')) {
            const html = await (await item.getType('text/html')).text();
            editor.chain().focus().insertContent(html).run();
            return;
          }
        }
      }
      const text = await navigator.clipboard.readText();
      if (!text) {
        announce('The clipboard is empty.');
        return;
      }
      const paragraphs = text.split(/\r?\n/).map((line) => ({
        type: 'paragraph',
        content: line ? [{ type: 'text', text: line }] : [],
      }));
      editor.chain().focus().insertContent(paragraphs.length === 1 ? text : paragraphs).run();
    } catch {
      announce('Your browser blocked clipboard access. Press Ctrl+V to paste.');
    }
  };

  const startPainter = () => {
    if (!canEdit()) return;
    const { state: editorState } = editor;
    const marks = (editorState.storedMarks ?? editorState.selection.$from.marks())
      .map((mark) => ({ type: mark.type.name, attrs: mark.attrs }));
    setPainter({ marks, align: editorState.selection.$from.parent.attrs.textAlign ?? null });
    announce('Now select the text to apply this formatting to (Esc to cancel)');
  };

  // --- Paragraph ---
  const indent = (delta) => {
    if (!canEdit()) return;
    const listItem = editor.isActive('taskItem') ? 'taskItem' : 'listItem';
    const inList = editor.isActive('listItem') || editor.isActive('taskItem');
    run((c) => {
      if (inList) {
        if (delta > 0) c.sinkListItem(listItem);
        else c.liftListItem(listItem);
      } else {
        c.changeIndent(delta);
      }
    });
  };

  const applyStyle = (id) => run((c) => {
    if (editor.isActive('blockquote') && id !== 'quote') c.unsetBlockquote();
    if (id === 'quote') {
      if (!editor.isActive('blockquote')) c.setBlockquote();
      return;
    }
    if (id.startsWith('h')) {
      c.setHeading({ level: Number(id.slice(1)) }).setBlockAttributes({ styleName: null, spacing: null });
      return;
    }
    c.setParagraph().setBlockAttributes({
      styleName: id === 'title' || id === 'subtitle' ? id : null,
      spacing: id === 'nospacing' ? 'none' : null,
    });
  });

  const disabled = !editor;

  return (
    <div className="hr-ribbon" aria-label="Home ribbon">
      {/* Clipboard */}
      <Group label="Clipboard" className="hr-clipboard">
        <div className="hr-paste">
          <button type="button" className="hr-btn hr-big" title="Paste (Ctrl+V)" onMouseDown={keep} onClick={() => paste(false)} disabled={disabled}>
            <ClipboardPaste size={26} strokeWidth={1.5} />
            <span>Paste</span>
          </button>
          <RibbonMenu title="Paste options" className="hr-big-arrow" width={200} trigger={<ChevronDown size={12} />}>
            {(close) => (
              <>
                <MenuItem label="Paste" onClick={() => { close(); paste(false); }} />
                <MenuItem label="Paste text only" onClick={() => { close(); paste(true); }} />
              </>
            )}
          </RibbonMenu>
        </div>
        <div className="hr-stack">
          <LabelButton icon={Scissors} label="Cut" title="Cut (Ctrl+X)" onClick={() => clipboardCommand('cut')} />
          <LabelButton icon={Copy} label="Copy" title="Copy (Ctrl+C)" onClick={() => clipboardCommand('copy')} />
          <LabelButton icon={Paintbrush} label="Format Painter" title="Format Painter: copy formatting from one place to another" onClick={painter ? () => setPainter(null) : startPainter} active={Boolean(painter)} />
        </div>
      </Group>

      {/* Font */}
      <Group label="Font" className="hr-font">
        <div className="hr-row">
          <RibbonMenu
            title="Font"
            className="hr-combo hr-font-combo"
            width={230}
            panelClassName="hr-menu-scroll"
            trigger={<><span style={{ fontFamily: state.font }}>{state.font}</span><ChevronDown size={12} /></>}
          >
            {(close) => FONTS.map((font) => (
              <MenuItem
                key={font}
                label={font}
                checked={state.font === font}
                style={{ fontFamily: font }}
                onClick={() => { close(); run((c) => c.setFontFamily(font)); }}
              />
            ))}
          </RibbonMenu>
          <div className="hr-size">
            <input
              id="hr-font-size"
              className="hr-size-input"
              aria-label="Font size"
              title="Font size (type a number and press Enter)"
              inputMode="decimal"
              value={sizeDraft ?? String(state.size ?? DEFAULT_SIZE)}
              onChange={(event) => setSizeDraft(event.target.value.replace(/[^\d.]/g, ''))}
              onKeyDown={(event) => {
                if (event.key === 'Enter') { event.preventDefault(); setSize(sizeDraft ?? state.size); }
                if (event.key === 'Escape') setSizeDraft(null);
              }}
              onBlur={() => setSizeDraft(null)}
            />
            <RibbonMenu title="Font sizes" className="hr-size-arrow" width={80} panelClassName="hr-menu-scroll" trigger={<ChevronDown size={12} />}>
              {(close) => SIZES.map((size) => (
                <MenuItem key={size} label={String(size)} checked={state.size === size} onClick={() => { close(); setSize(size); }} />
              ))}
            </RibbonMenu>
          </div>
          <IconButton icon={AArrowUp} title="Grow font (bigger text)" onClick={() => stepSize(1)} />
          <IconButton icon={AArrowDown} title="Shrink font (smaller text)" onClick={() => stepSize(-1)} />
          <RibbonMenu title="Change case" className="hr-icon hr-with-arrow" width={200} trigger={<><CaseSensitive size={17} strokeWidth={1.8} /><ChevronDown size={10} /></>}>
            {(close) => CASE_OPTIONS.map((option) => (
              <MenuItem
                key={option.id}
                label={option.label}
                onClick={() => {
                  close();
                  if (!canEdit()) return;
                  if (!changeCase(editor, option.id)) announce('Select some text first.');
                  editor.commands.focus();
                }}
              />
            ))}
          </RibbonMenu>
          <IconButton icon={RemoveFormatting} title="Clear all formatting" onClick={() => run((c) => c.unsetAllMarks().setBlockAttributes({ lineHeight: null, border: null, indent: 0, spacing: null, styleName: null }).setTextAlign('left'))} />
        </div>
        <div className="hr-row">
          <IconButton icon={Bold} title="Bold (Ctrl+B)" active={state.bold} onClick={() => run((c) => c.toggleBold())} />
          <IconButton icon={Italic} title="Italic (Ctrl+I)" active={state.italic} onClick={() => run((c) => c.toggleItalic())} />
          <IconButton icon={Underline} title="Underline (Ctrl+U)" active={state.underline} onClick={() => run((c) => c.toggleUnderline())} />
          <IconButton icon={Strikethrough} title="Strikethrough" active={state.strike} onClick={() => run((c) => c.toggleStrike())} />
          <IconButton icon={Subscript} title="Subscript" active={state.subscript} onClick={() => run((c) => c.toggleSubscript())} />
          <IconButton icon={Superscript} title="Superscript" active={state.superscript} onClick={() => run((c) => c.toggleSuperscript())} />
          <span className="hr-divider" aria-hidden="true" />
          <div className="hr-split">
            <button type="button" className="hr-btn hr-icon hr-color-btn" title="Text highlight colour" onMouseDown={keep} onClick={() => run((c) => c.toggleHighlight({ color: highlightColor }))}>
              <Highlighter size={16} strokeWidth={1.8} />
              <span className="hr-color-bar" style={{ background: highlightColor }} />
            </button>
            <RibbonMenu title="Highlight colours" className="hr-split-arrow" width={176} trigger={<ChevronDown size={10} />}>
              {(close) => (
                <ColorGrid
                  highlight
                  clearLabel="No colour"
                  onClear={() => { close(); run((c) => c.unsetHighlight()); }}
                  onPick={(color) => { close(); setHighlightColor(color); run((c) => c.setHighlight({ color })); }}
                />
              )}
            </RibbonMenu>
          </div>
          <div className="hr-split">
            <button type="button" className="hr-btn hr-icon hr-color-btn" title="Font colour" onMouseDown={keep} onClick={() => run((c) => c.setColor(fontColor))}>
              <Baseline size={16} strokeWidth={1.8} />
              <span className="hr-color-bar" style={{ background: fontColor }} />
            </button>
            <RibbonMenu title="Font colours" className="hr-split-arrow" width={236} trigger={<ChevronDown size={10} />}>
              {(close) => (
                <ColorGrid
                  clearLabel="Automatic"
                  current={state.color}
                  onClear={() => { close(); run((c) => c.unsetColor()); }}
                  onPick={(color) => { close(); setFontColor(color); run((c) => c.setColor(color)); }}
                />
              )}
            </RibbonMenu>
          </div>
        </div>
      </Group>

      {/* Paragraph */}
      <Group label="Paragraph" className="hr-paragraph">
        <div className="hr-row">
          <IconButton icon={List} title="Bullets" active={state.bulletList} onClick={() => run((c) => c.toggleBulletList())} />
          <IconButton icon={ListOrdered} title="Numbering" active={state.orderedList} onClick={() => run((c) => c.toggleOrderedList())} />
          <IconButton icon={ListChecks} title="Checklist" active={state.taskList} onClick={() => run((c) => c.toggleTaskList())} />
          <span className="hr-divider" aria-hidden="true" />
          <IconButton icon={IndentDecrease} title="Decrease indent" onClick={() => indent(-1)} />
          <IconButton icon={IndentIncrease} title="Increase indent" onClick={() => indent(1)} />
          <span className="hr-divider" aria-hidden="true" />
          <IconButton
            icon={ArrowDownAZ}
            title="Sort A to Z (selected paragraphs or list items)"
            onClick={() => { if (canEdit()) announce(sortBlocks(editor, 'asc')); }}
          />
          <IconButton icon={Pilcrow} title="Show/hide ¶ marks" active={showMarks} onClick={() => setShowMarks((value) => !value)} />
        </div>
        <div className="hr-row">
          <IconButton icon={AlignLeft} title="Align left" active={state.align === 'left'} onClick={() => run((c) => c.setTextAlign('left'))} />
          <IconButton icon={AlignCenter} title="Center" active={state.align === 'center'} onClick={() => run((c) => c.setTextAlign('center'))} />
          <IconButton icon={AlignRight} title="Align right" active={state.align === 'right'} onClick={() => run((c) => c.setTextAlign('right'))} />
          <IconButton icon={AlignJustify} title="Justify" active={state.align === 'justify'} onClick={() => run((c) => c.setTextAlign('justify'))} />
          <span className="hr-divider" aria-hidden="true" />
          <RibbonMenu title="Line and paragraph spacing" className="hr-icon hr-with-arrow" width={230} trigger={<><ArrowUpDown size={15} strokeWidth={1.8} /><ChevronDown size={10} /></>}>
            {(close) => (
              <>
                {LINE_SPACINGS.map((value) => (
                  <MenuItem
                    key={value}
                    label={value.includes('.') ? value : `${value}.0`}
                    checked={state.lineHeight === value}
                    onClick={() => { close(); run((c) => c.setBlockAttributes({ lineHeight: value })); }}
                  />
                ))}
                <div className="hr-menu-divider" />
                <MenuItem label="Remove space between paragraphs" onClick={() => { close(); run((c) => c.setBlockAttributes({ spacing: 'none' })); }} />
                <MenuItem label="Add space between paragraphs" onClick={() => { close(); run((c) => c.setBlockAttributes({ spacing: null })); }} />
                <MenuItem label="Reset line spacing" onClick={() => { close(); run((c) => c.setBlockAttributes({ lineHeight: null })); }} />
              </>
            )}
          </RibbonMenu>
          <div className="hr-split">
            <button type="button" className="hr-btn hr-icon hr-color-btn" title="Shading" onMouseDown={keep} onClick={() => run((c) => c.setBackgroundColor(shadingColor))}>
              <PaintBucket size={15} strokeWidth={1.8} />
              <span className="hr-color-bar" style={{ background: shadingColor }} />
            </button>
            <RibbonMenu title="Shading colours" className="hr-split-arrow" width={236} trigger={<ChevronDown size={10} />}>
              {(close) => (
                <ColorGrid
                  clearLabel="No colour"
                  onClear={() => { close(); run((c) => c.unsetBackgroundColor()); }}
                  onPick={(color) => { close(); setShadingColor(color); run((c) => c.setBackgroundColor(color)); }}
                />
              )}
            </RibbonMenu>
          </div>
          <RibbonMenu title="Borders" className="hr-icon hr-with-arrow" width={190} trigger={<><Square size={15} strokeWidth={1.8} /><ChevronDown size={10} /></>}>
            {(close) => BORDER_OPTIONS.map((option) => (
              <MenuItem
                key={option.label}
                label={option.label}
                checked={state.border === option.id}
                onClick={() => { close(); run((c) => c.setBlockAttributes({ border: option.id })); }}
              />
            ))}
          </RibbonMenu>
        </div>
      </Group>

      {/* Styles */}
      <Group label="Styles" className="hr-styles">
        <div className="hr-style-gallery" role="listbox" aria-label="Paragraph styles">
          {STYLES.map((style) => (
            <button
              key={style.id}
              type="button"
              role="option"
              aria-selected={state.style === style.id}
              className={`hr-style ${state.style === style.id ? 'is-active' : ''}`}
              title={`Apply the ${style.label} style`}
              onMouseDown={keep}
              onClick={() => applyStyle(style.id)}
            >
              <span className={`hr-style-preview hr-preview-${style.id}`}>{style.id === 'title' ? 'AaBb' : 'AaBbCc'}</span>
              <span className="hr-style-name">{style.label}</span>
            </button>
          ))}
        </div>
      </Group>

      {/* Editing */}
      <Group label="Editing" className="hr-editing">
        <div className="hr-stack">
          <LabelButton icon={Search} label="Find" title="Find (Ctrl+F)" onClick={onFind} />
          <LabelButton icon={Replace} label="Replace" title="Replace" onClick={onReplace} />
          <RibbonMenu
            title="Select"
            className="hr-labelled hr-with-arrow"
            width={190}
            trigger={<><MousePointer2 size={15} strokeWidth={1.8} /><span>Select</span><ChevronDown size={10} /></>}
          >
            {(close) => (
              <>
                <MenuItem label="Select all" onClick={() => { close(); run((c) => c.selectAll()); }} />
                <MenuItem label="Select this paragraph" onClick={() => { close(); run((c) => c.selectParentNode()); }} />
              </>
            )}
          </RibbonMenu>
        </div>
      </Group>
    </div>
  );
}
