import spritesheetURL from 'emoji-datasource/img/twitter/sheets/32.png';
import { Data, FrequentlyUsed, SearchIndex, Store, init } from 'emoji-mart';
import React, {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { defineMessages, useIntl } from 'react-intl';

import data from '../data';

import * as Icons from './icons';

import pickerStyles from './styles.scss?inline';

const messages = defineMessages({
  searchLabel: { id: 'emoji_button.search_label', defaultMessage: 'Search emojis' },
  clearSearch: { id: 'emoji_button.clear_search', defaultMessage: 'Clear search' },
  categories: { id: 'emoji_button.categories', defaultMessage: 'Emoji categories' },
  searchResultsCount: {
    id: 'emoji_button.search_results_count',
    defaultMessage: '{count, plural, one {# emoji found} other {# emojis found}}',
  },
});

/** Rows are rendered in chunks of this size, only when close to the visible area. */
const ROWS_PER_CHUNK = 10;
const MAX_FREQUENT_ROWS = 4;
const SKIN_TONES = [1, 2, 3, 4, 5, 6] as const;

interface PickerEmojiSkin {
  native?: string;
  unified?: string;
  shortcodes?: string;
  src?: string;
  x?: number;
  y?: number;
}

interface PickerEmoji {
  id: string;
  name: string;
  keywords?: string[];
  skins: PickerEmojiSkin[];
  aliases?: string[];
  emoticons?: string[];
}

interface PickerCategory {
  id: string;
  name?: string;
  emojis: Array<string | PickerEmoji>;
  target?: PickerCategory;
}

interface PickerI18n {
  search: string;
  search_no_results_1: string;
  search_no_results_2: string;
  categories: Record<string, string>;
  skins: Record<'choose' | (typeof SKIN_TONES)[number], string>;
}

interface PickedEmoji {
  id: string;
  name: string;
  native?: string;
  unified?: string;
  keywords?: string[];
  shortcodes: string;
  skin?: number;
  src?: string;
  aliases?: string[];
  emoticons?: string[];
}

interface GridRow {
  categoryId: string;
  /** Index of the row within its category. */
  index: number;
  emojis: PickerEmoji[];
}

type Position = [row: number, column: number];

interface IEmojiPicker {
  custom?: Array<{ id: string; name: string; emojis: PickerEmoji[] }>;
  title: string;
  onEmojiSelect: (emoji: PickedEmoji) => void;
  /** Called when the picker should close without picking, e.g. on Escape. */
  onClose?: () => void;
  perLine: number;
  emojiSize: number;
  emojiButtonSize: number;
  theme: 'light' | 'dark';
  i18n: PickerI18n;
}

const getEmoji = (emoji: string | PickerEmoji): PickerEmoji | undefined =>
  (SearchIndex as any).get(emoji);

const getEmojiSkin = (emoji: PickerEmoji, skin: number) => emoji.skins[skin - 1] || emoji.skins[0];

// Same as emoji-mart's `getEmojiData`, which is not exported.
const getEmojiData = (emoji: PickerEmoji, skin: number): PickedEmoji => {
  let skinIndex = skin - 1;
  if (!emoji.skins[skinIndex]) skinIndex = 0;
  const emojiSkin = emoji.skins[skinIndex];

  const emojiData: PickedEmoji = {
    id: emoji.id,
    name: emoji.name,
    native: emojiSkin.native,
    unified: emojiSkin.unified,
    keywords: emoji.keywords,
    shortcodes: emojiSkin.shortcodes!,
  };

  if (emoji.skins.length > 1) emojiData.skin = skinIndex + 1;
  if (emojiSkin.src) emojiData.src = emojiSkin.src;
  if (emoji.aliases?.length) emojiData.aliases = emoji.aliases;
  if (emoji.emoticons?.length) emojiData.emoticons = emoji.emoticons;

  return emojiData;
};

const splitIntoRows = (emojis: PickerEmoji[], perLine: number, categoryId: string) => {
  const rows: GridRow[] = [];

  for (let i = 0; i < emojis.length; i += perLine) {
    rows.push({ categoryId, index: rows.length, emojis: emojis.slice(i, i + perLine) });
  }

  return rows;
};

const positionKey = ([row, column]: Position) => `${row}:${column}`;

interface IEmojiImage {
  emoji: PickerEmoji;
  skin: number;
  size: number;
}

/** Visual-only rendering of an emoji. The button around it carries the accessible name. */
const EmojiImage: React.FC<IEmojiImage> = ({ emoji, skin, size }) => {
  const emojiSkin = getEmojiSkin(emoji, skin);
  const { sheet } = Data as { sheet: { cols: number; rows: number } };

  return (
    <span className='emoji-mart-emoji' data-emoji-set='twitter' aria-hidden>
      {emojiSkin.src ? (
        <img
          style={{ maxWidth: size, maxHeight: size, display: 'inline-block' }}
          alt=''
          src={emojiSkin.src}
          loading='lazy'
        />
      ) : (
        <span
          style={{
            display: 'block',
            width: size,
            height: size,
            backgroundImage: `url(${spritesheetURL})`,
            backgroundSize: `${100 * sheet.cols}% ${100 * sheet.rows}%`,
            backgroundPosition: `${(100 / (sheet.cols - 1)) * emojiSkin.x!}% ${
              (100 / (sheet.rows - 1)) * emojiSkin.y!
            }%`,
          }}
        />
      )}
    </span>
  );
};

/**
 * Keyboard and screen reader accessible reimplementation of emoji-mart's picker.
 *
 * It keeps emoji-mart's markup and stylesheet, so it looks the same, but:
 * - every part is reachable with Tab, and Tab stays inside the picker,
 * - emojis are real focusable buttons in a grid per category, browsed with arrow keys,
 * - Escape closes the picker, so focus can go back to the button that opened it,
 * - search result counts are announced.
 */
const EmojiPickerContent: React.FC<IEmojiPicker> = ({
  title,
  onEmojiSelect,
  onClose,
  perLine,
  emojiSize,
  emojiButtonSize,
  theme,
  i18n,
}) => {
  const intl = useIntl();
  const idPrefix = useId();

  const categories = Data.categories as PickerCategory[];
  const navCategories = useMemo(() => categories.filter((category) => !category.target), []);

  const rootRef = useRef<HTMLElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const latestQueryRef = useRef('');
  const skinToneButtonRef = useRef<HTMLButtonElement>(null);
  const skinToneMenuRef = useRef<HTMLDivElement>(null);
  const navButtonRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const cellRefs = useRef(new Map<string, HTMLButtonElement>());
  const categoryRefs = useRef(new Map<string, HTMLDivElement>());
  const chunkRefs = useRef(new Map<number, HTMLDivElement>());

  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<GridRow[] | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const [skin, setSkin] = useState<number>(() => Store.get('skin') || 1);
  const [skinMenu, setSkinMenu] = useState<{ tempSkin?: number; shown: boolean } | null>(null);
  const [currentCategoryId, setCurrentCategoryId] = useState(navCategories[0]?.id);
  const [navFocusIndex, setNavFocusIndex] = useState(0);
  const [visibleChunks, setVisibleChunks] = useState<Set<number>>(() => new Set([0]));
  const [activePosition, setActivePosition] = useState<Position>([0, 0]);
  const [pendingFocus, setPendingFocus] = useState<{ alignCategory?: string } | null>(null);

  const grid = useMemo(
    () =>
      categories.flatMap((category) =>
        splitIntoRows(
          category.emojis.map(getEmoji).filter((emoji): emoji is PickerEmoji => !!emoji),
          perLine,
          category.id,
        ),
      ),
    [categories, perLine],
  );

  const currentGrid = searchResults ?? grid;
  const shownSkin = skinMenu?.tempSkin ?? skin;
  const lineWidth = perLine * emojiButtonSize;

  const getCategoryName = (category: PickerCategory) =>
    category.name || i18n.categories[category.id];

  const getEmojiLabel = (emoji: PickerEmoji) => getEmojiSkin(emoji, skin).native || emoji.name;

  // Focus the search field when the picker opens
  useEffect(() => {
    searchInputRef.current?.focus();
  }, []);

  // Render only rows close to the visible area, like emoji-mart does
  useEffect(() => {
    if (searchResults) return;

    const observer = new IntersectionObserver(
      (entries) => {
        setVisibleChunks((previous) => {
          const next = new Set(previous);
          for (const entry of entries) {
            const index = Number((entry.target as HTMLElement).dataset.index);
            if (entry.isIntersecting) next.add(index);
            else next.delete(index);
          }
          return next;
        });
      },
      {
        root: scrollRef.current,
        rootMargin: `${emojiButtonSize * (ROWS_PER_CHUNK + 5)}px 0px ${emojiButtonSize * ROWS_PER_CHUNK}px`,
      },
    );

    for (const element of chunkRefs.current.values()) observer.observe(element);

    return () => observer.disconnect();
  }, [grid, searchResults]);

  // Highlight the category currently in view in the navigation
  useEffect(() => {
    if (searchResults) return;

    const ratios = new Map(navCategories.map((category) => [category.id, 0]));

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          ratios.set((entry.target as HTMLElement).dataset.id!, entry.intersectionRatio);
        }

        for (const [id, ratio] of ratios) {
          if (ratio) {
            setCurrentCategoryId(id);
            break;
          }
        }
      },
      { root: scrollRef.current, threshold: [0, 1] },
    );

    for (const element of categoryRefs.current.values()) observer.observe(element);

    return () => observer.disconnect();
  }, [searchResults]);

  const keepInView = (element: HTMLElement) => {
    const scroll = scrollRef.current;
    if (!scroll) return;

    const scrollRect = scroll.getBoundingClientRect();
    const rect = element.getBoundingClientRect();
    const header = element.closest('.category')?.querySelector<HTMLElement>('.sticky');
    const top = scrollRect.top + (header?.offsetHeight ?? 0);

    if (rect.top < top) {
      scroll.scrollTop -= top - rect.top;
    } else if (rect.bottom > scrollRect.bottom) {
      scroll.scrollTop += rect.bottom - scrollRect.bottom;
    }
  };

  // Move focus to the active emoji once its row is rendered
  useLayoutEffect(() => {
    if (!pendingFocus) return;

    const scroll = scrollRef.current;
    const categoryElement =
      pendingFocus.alignCategory && categoryRefs.current.get(pendingFocus.alignCategory);
    if (scroll && categoryElement) {
      scroll.scrollTop +=
        categoryElement.getBoundingClientRect().top - scroll.getBoundingClientRect().top + 1;
    }

    const cell = cellRefs.current.get(positionKey(activePosition));
    if (!cell) return;

    cell.focus({ preventScroll: true });
    if (!categoryElement) keepInView(cell);
    setPendingFocus(null);
  }, [pendingFocus, activePosition, searchResults]);

  const focusCell = (position: Position, options: { alignCategory?: string } = {}) => {
    setActivePosition(position);
    setPendingFocus(options);
  };

  const pickEmoji = (emoji: PickerEmoji) => {
    const emojiData = getEmojiData(emoji, skin);
    FrequentlyUsed.add(emojiData);
    onEmojiSelect(emojiData);
  };

  const runSearch = async (value: string) => {
    latestQueryRef.current = value;
    const results: PickerEmoji[] | null | undefined = await SearchIndex.search(value);

    // Ignore results of an outdated query
    if (latestQueryRef.current !== value) return;

    if (!results) {
      setSearchResults(null);
      setAnnouncement('');
      setActivePosition([0, 0]);
      return;
    }

    setSearchResults(splitIntoRows(results, perLine, 'search'));
    setActivePosition([0, 0]);
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
    setAnnouncement(
      results.length
        ? intl.formatMessage(messages.searchResultsCount, { count: results.length })
        : `${i18n.search_no_results_1} ${i18n.search_no_results_2}`,
    );
  };

  const handleSearchChange: React.ChangeEventHandler<HTMLInputElement> = (e) => {
    setQuery(e.target.value);
    runSearch(e.target.value);
  };

  const clearSearch = () => {
    latestQueryRef.current = '';
    setQuery('');
    setSearchResults(null);
    setAnnouncement('');
    setActivePosition([0, 0]);
    searchInputRef.current?.focus();
  };

  const handleSearchKeyDown: React.KeyboardEventHandler<HTMLInputElement> = (e) => {
    switch (e.key) {
      case 'ArrowDown':
        if (currentGrid.length) {
          e.preventDefault();
          focusCell([0, 0]);
        }
        break;
      case 'Enter': {
        e.preventDefault();
        const firstResult = searchResults?.[0]?.emojis[0];
        if (firstResult) pickEmoji(firstResult);
        break;
      }
      case 'Escape':
        if (query) {
          e.preventDefault();
          e.stopPropagation();
          clearSearch();
        }
        break;
    }
  };

  const getNextPosition = (e: React.KeyboardEvent, [row, column]: Position): Position | null => {
    const lastRow = currentGrid.length - 1;
    const rowLength = (index: number) => currentGrid[index].emojis.length;

    const findCategoryStart = (from: number, direction: -1 | 1) => {
      let index = from;
      while (
        currentGrid[index + direction] &&
        currentGrid[index + direction].categoryId === currentGrid[from].categoryId
      ) {
        index += direction;
      }
      return index;
    };

    switch (e.key) {
      case 'ArrowLeft':
        if (column > 0) return [row, column - 1];
        if (row > 0) return [row - 1, rowLength(row - 1) - 1];
        return null;
      case 'ArrowRight':
        if (column < rowLength(row) - 1) return [row, column + 1];
        if (row < lastRow) return [row + 1, 0];
        return null;
      case 'ArrowUp':
        if (row > 0) return [row - 1, Math.min(column, rowLength(row - 1) - 1)];
        return null;
      case 'ArrowDown':
        if (row < lastRow) return [row + 1, Math.min(column, rowLength(row + 1) - 1)];
        return null;
      case 'Home':
        return e.ctrlKey ? [0, 0] : [row, 0];
      case 'End':
        return e.ctrlKey ? [lastRow, rowLength(lastRow) - 1] : [row, rowLength(row) - 1];
      case 'PageUp': {
        // Start of this category, or of the previous one when already there
        const start = findCategoryStart(row, -1);
        if (start !== row || column !== 0) return [start, 0];
        return row > 0 ? [findCategoryStart(row - 1, -1), 0] : null;
      }
      case 'PageDown': {
        const end = findCategoryStart(row, 1);
        return end < lastRow ? [end + 1, 0] : null;
      }
      default:
        return null;
    }
  };

  const handleGridKeyDown: React.KeyboardEventHandler<HTMLDivElement> = (e) => {
    const target = e.target as HTMLElement;
    if (!target.dataset.row) return;

    const position: Position = [Number(target.dataset.row), Number(target.dataset.column)];
    const nextPosition = getNextPosition(e, position);

    if (nextPosition) {
      e.preventDefault();
      focusCell(nextPosition);
      return;
    }

    // Typing while browsing emojis searches for them
    if (e.key.length === 1 && e.key !== ' ' && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      const value = query + e.key;
      setQuery(value);
      searchInputRef.current?.focus();
      runSearch(value);
    }
  };

  const goToCategory = (category: PickerCategory) => {
    if (searchResults) {
      latestQueryRef.current = '';
      setQuery('');
      setSearchResults(null);
      setAnnouncement('');
    }

    const row = grid.findIndex((gridRow) => gridRow.categoryId === category.id);
    if (row === -1) return;

    focusCell([row, 0], { alignCategory: category.id });
  };

  const handleNavKeyDown: React.KeyboardEventHandler<HTMLDivElement> = (e) => {
    const last = navCategories.length - 1;
    let index: number | null = null;

    switch (e.key) {
      case 'ArrowLeft':
        index = navFocusIndex > 0 ? navFocusIndex - 1 : last;
        break;
      case 'ArrowRight':
        index = navFocusIndex < last ? navFocusIndex + 1 : 0;
        break;
      case 'Home':
        index = 0;
        break;
      case 'End':
        index = last;
        break;
    }

    if (index !== null) {
      e.preventDefault();
      setNavFocusIndex(index);
      navButtonRefs.current[index]?.focus();
    }
  };

  const openSkinMenu = () => {
    setSkinMenu({ shown: false });
  };

  const closeSkinMenu = () => {
    setSkinMenu(null);
    skinToneButtonRef.current?.focus();
  };

  const chooseSkin = (value: number) => {
    setSkin(value);
    Store.set('skin', value as any);
    closeSkinMenu();
  };

  // Animate the skin tone menu in and focus the current skin tone
  useEffect(() => {
    if (!skinMenu || skinMenu.shown) return;

    const frame = requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        setSkinMenu((menu) => menu && { ...menu, shown: true });
        skinToneMenuRef.current
          ?.querySelector<HTMLInputElement>('input[type="radio"]:checked')
          ?.focus();
      }),
    );

    return () => cancelAnimationFrame(frame);
  }, [skinMenu]);

  const getTabbableElements = () =>
    Array.from(
      rootRef.current?.querySelectorAll<HTMLElement>(
        'button:not([tabindex="-1"]), input:not([tabindex="-1"]):not([type="radio"])',
      ) ?? [],
    ).filter((element) => element.offsetParent !== null);

  const handleRootKeyDown: React.KeyboardEventHandler<HTMLElement> = (e) => {
    // Keep the app's hotkeys and parent elements from handling keys pressed in the picker
    e.stopPropagation();

    if (e.key === 'Escape' && !e.defaultPrevented) {
      e.preventDefault();
      if (skinMenu) closeSkinMenu();
      else onClose?.();
      return;
    }

    // Keep Tab inside the picker
    if (e.key === 'Tab' && !skinMenu) {
      const tabbable = getTabbableElements();
      const shadowRoot = rootRef.current?.getRootNode() as ShadowRoot | undefined;
      const index = tabbable.indexOf(shadowRoot?.activeElement as HTMLElement);
      const nextIndex = e.shiftKey
        ? index <= 0
          ? tabbable.length - 1
          : index - 1
        : index === tabbable.length - 1
          ? 0
          : index + 1;

      e.preventDefault();
      tabbable[nextIndex]?.focus();
    }
  };

  const handleRootClickCapture: React.MouseEventHandler<HTMLElement> = (e) => {
    if (skinMenu && !(e.target as HTMLElement).closest('.menu')) {
      e.preventDefault();
      e.stopPropagation();
      setSkinMenu(null);
    }
  };

  const renderEmojiButton = (emoji: PickerEmoji, position: Position, tabbable: boolean) => {
    const key = positionKey(position);

    return (
      <div
        key={`${key}:${emoji.id}`}
        role='gridcell'
        className='flex'
        style={{ width: emojiButtonSize, height: emojiButtonSize }}
      >
        <button
          ref={(element) => {
            if (element) cellRefs.current.set(key, element);
            else if (cellRefs.current.get(key)?.isConnected === false) cellRefs.current.delete(key);
          }}
          aria-label={getEmojiLabel(emoji)}
          title={emoji.name}
          type='button'
          className='flex flex-center flex-middle'
          tabIndex={tabbable ? 0 : -1}
          data-row={position[0]}
          data-column={position[1]}
          onClick={() => pickEmoji(emoji)}
          onFocus={() => setActivePosition(position)}
          style={{
            width: emojiButtonSize,
            height: emojiButtonSize,
            fontSize: emojiSize,
            lineHeight: 0,
          }}
        >
          <div aria-hidden className='background' style={{ borderRadius: '100%' }} />
          <EmojiImage emoji={emoji} skin={shownSkin} size={emojiSize} />
        </button>
      </div>
    );
  };

  const renderRowCells = (row: GridRow, rowIndex: number) => {
    const cells = row.emojis.map((emoji, column) =>
      renderEmojiButton(
        emoji,
        [rowIndex, column],
        activePosition[0] === rowIndex && activePosition[1] === column,
      ),
    );

    // Keep the last row aligned with the others
    for (let i = row.emojis.length; i < perLine; i++) {
      cells.push(
        <div key={`empty-${i}`} style={{ width: emojiButtonSize, height: emojiButtonSize }} />,
      );
    }

    return cells;
  };

  const renderNav = () => (
    <nav
      id='nav'
      className='padding'
      data-position='top'
      dir='ltr'
      aria-label={intl.formatMessage(messages.categories)}
    >
      {/* oxlint-disable-next-line jsx-a11y/no-static-element-interactions -- arrow key navigation between the buttons */}
      <div className='flex relative' onKeyDown={handleNavKeyDown}>
        {navCategories.map((category, i) => {
          const name = getCategoryName(category);
          const current = !searchResults && category.id === currentCategoryId;
          const icon =
            (Icons.categories as Record<string, any>)[category.id] ?? Icons.categories.custom;

          return (
            <button
              key={category.id}
              ref={(element) => {
                navButtonRefs.current[i] = element;
              }}
              aria-label={name}
              aria-current={current || undefined}
              title={name}
              type='button'
              className='flex flex-grow flex-center'
              tabIndex={i === navFocusIndex ? 0 : -1}
              onFocus={() => setNavFocusIndex(i)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => goToCategory(category)}
            >
              <span className='flex' aria-hidden>
                {icon[theme === 'light' ? 'outline' : 'solid'] ?? icon}
              </span>
            </button>
          );
        })}

        <div
          className='bar'
          style={{
            width: `${100 / navCategories.length}%`,
            opacity: searchResults ? 0 : 1,
            transform: `translateX(${
              Math.max(
                navCategories.findIndex((category) => category.id === currentCategoryId),
                0,
              ) * 100
            }%)`,
          }}
        />
      </div>
    </nav>
  );

  const renderSearch = () => (
    <div className='padding-lr'>
      <div className='spacer' />
      <div className='flex flex-middle'>
        <div className='search relative flex-grow'>
          <input
            type='search'
            ref={searchInputRef}
            value={query}
            placeholder={i18n.search}
            aria-label={intl.formatMessage(messages.searchLabel)}
            onChange={handleSearchChange}
            onKeyDown={handleSearchKeyDown}
            autoComplete='off'
          />
          <span className='icon loupe flex' aria-hidden>
            {Icons.search.loupe}
          </span>
          {searchResults && (
            <button
              title={intl.formatMessage(messages.clearSearch)}
              aria-label={intl.formatMessage(messages.clearSearch)}
              type='button'
              className='icon delete flex'
              onClick={clearSearch}
              onMouseDown={(e) => e.preventDefault()}
            >
              {Icons.search.delete}
            </button>
          )}
        </div>

        <div
          className='flex flex-auto flex-center flex-middle'
          style={{ position: 'relative', width: emojiButtonSize, height: emojiButtonSize }}
        >
          <button
            type='button'
            ref={skinToneButtonRef}
            className='skin-tone-button flex flex-auto flex-center flex-middle'
            aria-label={i18n.skins.choose}
            aria-haspopup='true'
            aria-expanded={!!skinMenu}
            title={i18n.skins.choose}
            onClick={openSkinMenu}
            style={{ width: emojiSize, height: emojiSize }}
          >
            <span className={`skin-tone skin-tone-${skin}`} />
          </button>
        </div>
      </div>
    </div>
  );

  const renderSearchResults = () => {
    if (!searchResults) return null;

    const headingId = `${idPrefix}-search`;

    return (
      <div className='category'>
        <h2 className='sticky padding-small align-l' id={headingId}>
          {i18n.categories.search}
        </h2>
        {searchResults.length ? (
          <div
            role='grid'
            aria-labelledby={headingId}
            aria-rowcount={searchResults.length}
            aria-colcount={perLine}
            onKeyDown={handleGridKeyDown}
          >
            {searchResults.map((row, i) => (
              <div key={row.emojis[0].id} role='row' aria-rowindex={i + 1} className='flex'>
                {renderRowCells(row, i)}
              </div>
            ))}
          </div>
        ) : (
          <div className='padding-small align-l'>
            {i18n.search_no_results_1} {i18n.search_no_results_2}
          </div>
        )}
      </div>
    );
  };

  const renderCategories = () => {
    const activeChunk = activePosition[0] - (activePosition[0] % ROWS_PER_CHUNK);
    let rowIndex = 0;

    return (
      <div style={searchResults ? { display: 'none' } : { height: '100%' }}>
        {categories.map((category) => {
          const firstRow = rowIndex;
          const rows: GridRow[] = [];
          while (grid[rowIndex]?.categoryId === category.id) rows.push(grid[rowIndex++]);

          if (!rows.length) return null;

          const headingId = `${idPrefix}-${category.id}`;

          return (
            <div
              key={category.id}
              data-id={category.target ? category.target.id : category.id}
              className='category'
              ref={(element) => {
                if (element) categoryRefs.current.set(category.id, element);
                else categoryRefs.current.delete(category.id);
              }}
            >
              <h2 className='sticky padding-small align-l' id={headingId}>
                {getCategoryName(category)}
              </h2>
              <div
                role='grid'
                aria-labelledby={headingId}
                aria-rowcount={rows.length}
                aria-colcount={perLine}
                className='relative'
                style={{ height: rows.length * emojiButtonSize }}
                onKeyDown={handleGridKeyDown}
              >
                {rows.map((row, i) => {
                  const index = firstRow + i;
                  const chunk = index - (index % ROWS_PER_CHUNK);
                  const isChunkStart = index === chunk;
                  const visible =
                    (!searchResults && visibleChunks.has(chunk)) ||
                    (!searchResults && chunk === activeChunk);

                  if (!visible && !isChunkStart) return null;

                  return (
                    <div
                      key={index}
                      data-index={index}
                      ref={
                        isChunkStart
                          ? (element) => {
                              if (element) chunkRefs.current.set(index, element);
                              else chunkRefs.current.delete(index);
                            }
                          : undefined
                      }
                      role={visible ? 'row' : undefined}
                      aria-rowindex={visible ? i + 1 : undefined}
                      className='flex row'
                      style={{ top: i * emojiButtonSize }}
                    >
                      {visible && renderRowCells(row, index)}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  const renderSkinMenu = () => {
    const button = skinToneButtonRef.current;
    const root = rootRef.current;
    if (!skinMenu || !button || !root) return null;

    const buttonRect = button.getBoundingClientRect();
    const rootRect = root.getBoundingClientRect();

    return (
      <div
        ref={skinToneMenuRef}
        role='radiogroup'
        dir='ltr'
        aria-label={i18n.skins.choose}
        className={skinMenu.shown ? 'menu' : 'menu hidden'}
        data-position='top'
        style={{
          right: rootRect.right - buttonRect.right - 3,
          top: buttonRect.bottom - rootRect.top + 3,
          bottom: 'auto',
        }}
      >
        {SKIN_TONES.map((value) => (
          <div key={value}>
            <input
              type='radio'
              name={`${idPrefix}-skin-tone`}
              value={value}
              aria-label={i18n.skins[value]}
              defaultChecked={value === skin}
              onChange={() => setSkinMenu((menu) => menu && { ...menu, tempSkin: value })}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ' || e.key === 'Tab') {
                  e.preventDefault();
                  chooseSkin(value);
                }
              }}
            />

            <button
              type='button'
              aria-hidden
              tabIndex={-1}
              onClick={() => chooseSkin(value)}
              onMouseEnter={() => setSkinMenu((menu) => menu && { ...menu, tempSkin: value })}
              onMouseLeave={() => setSkinMenu((menu) => menu && { ...menu, tempSkin: undefined })}
              className='option flex flex-grow flex-middle'
            >
              <span className={`skin-tone skin-tone-${value}`} />
              <span className='margin-small-lr'>{i18n.skins[value]}</span>
            </button>
          </div>
        ))}
      </div>
    );
  };

  return (
    <section
      ref={rootRef}
      id='root'
      role='dialog'
      aria-label={title}
      className='flex flex-column'
      dir='ltr'
      style={{ width: `calc(${lineWidth}px + (var(--padding) + var(--sidebar-width)))` }}
      data-emoji-set='twitter'
      data-theme={theme}
      data-menu={skinMenu ? '' : undefined}
      onKeyDown={handleRootKeyDown}
      onClickCapture={handleRootClickCapture}
    >
      {renderNav()}
      {renderSearch()}

      <div ref={scrollRef} className='scroll flex-grow padding-lr'>
        <div style={{ width: lineWidth, height: '100%' }}>
          {renderSearchResults()}
          {renderCategories()}
        </div>
      </div>

      {renderSkinMenu()}

      <div aria-live='polite' className='sr-only'>
        {announcement}
      </div>
    </section>
  );
};

/** Renders the picker in a shadow root, so emoji-mart's stylesheet applies to it alone. */
const EmojiPicker: React.FC<IEmojiPicker> = (props) => {
  const hostRef = useRef<HTMLDivElement>(null);
  const [shadowRoot, setShadowRoot] = useState<ShadowRoot | null>(null);
  const [initialized, setInitialized] = useState(false);

  useLayoutEffect(() => {
    const host = hostRef.current!;
    const root = host.shadowRoot ?? host.attachShadow({ mode: 'open' });

    const sheet = new CSSStyleSheet();
    sheet.replaceSync(pickerStyles);
    root.adoptedStyleSheets = [sheet];

    setShadowRoot(root);
  }, []);

  useEffect(() => {
    init({
      data,
      custom: props.custom,
      i18n: props.i18n,
      set: 'twitter',
      perLine: props.perLine,
      maxFrequentRows: MAX_FREQUENT_ROWS,
    }).then(() => setInitialized(true));
  }, []);

  // Clicks and key presses are handled inside the shadow root. Don't let them
  // reach the app a second time through the host element.
  const stopPropagation = useCallback((e: React.SyntheticEvent) => e.stopPropagation(), []);

  return (
    // oxlint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events
    <div
      ref={hostRef}
      className='emoji-picker'
      onClick={stopPropagation}
      onKeyDown={stopPropagation}
    >
      {shadowRoot && initialized && createPortal(<EmojiPickerContent {...props} />, shadowRoot)}
    </div>
  );
};

export { EmojiPicker as default, type IEmojiPicker, type PickedEmoji };
