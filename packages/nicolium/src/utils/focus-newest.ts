import { useEffect, useRef } from 'react';

import type { VirtuosoHandle } from 'react-virtuoso';

/** Event asking the list whose ID is `detail.listId` to focus its most recent entry. */
const FOCUS_NEWEST_EVENT = 'nicolium:focus-newest';

/** Attribute marking an element as a list which reacts to the "focus newest" hotkey. */
const FOCUS_LIST_ATTRIBUTE = 'data-focus-list';

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])';

/** Find the list the user is in: the one holding focus, or the main list of the current area. */
const findList = (): Element | null => {
  const listSelector = `[${FOCUS_LIST_ATTRIBUTE}]`;
  const active = document.activeElement;

  const ownList = active?.closest(listSelector);
  if (ownList) return ownList;

  const scope =
    active?.closest('[role="dialog"], .deck__column') ?? document.querySelector('main') ?? document;

  return (
    scope.querySelector(`[role="feed"]${listSelector}`) ??
    scope.querySelector(listSelector) ??
    document.querySelector(`[role="feed"]${listSelector}`) ??
    document.querySelector(listSelector)
  );
};

/**
 * Focus the most recent entry of the list the user is in: the list holding the focused
 * element, or the main list of the deck column, dialog or page.
 */
const focusNewestInList = (): boolean => {
  const list = findList();
  if (!list) return false;

  document.dispatchEvent(
    new CustomEvent(FOCUS_NEWEST_EVENT, {
      detail: { listId: list.getAttribute(FOCUS_LIST_ATTRIBUTE) },
    }),
  );
  return true;
};

/** Focus an item of a list: its `.focusable` element, or the first focusable element in it. */
const focusListItem = (item: Element | null | undefined, selector = '.focusable'): boolean => {
  const element =
    item?.querySelector<HTMLElement>(selector) ??
    item?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
  element?.focus({ preventScroll: false });
  return !!element;
};

/**
 * Scroll a Virtuoso list marked with `listId` to its first or last item and focus it.
 * For lists rendered with Virtuoso directly instead of `ScrollableList`.
 */
const focusListEdge = (
  listId: string,
  handle: React.RefObject<VirtuosoHandle | null>,
  edge: 'first' | 'last',
  selector?: string,
) => {
  handle.current?.scrollToIndex({
    index: edge === 'first' ? 0 : 'LAST',
    align: edge === 'first' ? 'start' : 'end',
  });
  setTimeout(() => {
    const items = document.querySelectorAll(`[${FOCUS_LIST_ATTRIBUTE}="${listId}"] [data-index]`);
    focusListItem(edge === 'first' ? items[0] : items[items.length - 1], selector);
  }, 150);
};

/** Call `handler` when the "focus newest" hotkey targets the list marked with `listId`. */
const useFocusNewest = (listId: string, handler: () => void) => {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    const listener = (event: Event) => {
      if ((event as CustomEvent<{ listId: string }>).detail?.listId === listId) {
        handlerRef.current();
      }
    };
    document.addEventListener(FOCUS_NEWEST_EVENT, listener);
    return () => document.removeEventListener(FOCUS_NEWEST_EVENT, listener);
  }, [listId]);
};

export { FOCUS_LIST_ATTRIBUTE, focusListEdge, focusListItem, focusNewestInList, useFocusNewest };
