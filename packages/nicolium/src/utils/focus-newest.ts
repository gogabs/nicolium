import { useEffect, useRef, useState } from 'react';

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

/**
 * Focus an item of a list: its `.focusable` element, or the first focusable element in it.
 * Returns whether it got focus, which fails eg. while Virtuoso keeps the list hidden.
 */
const focusListItem = (item: Element | null | undefined, selector = '.focusable'): boolean => {
  const element =
    item?.querySelector<HTMLElement>(selector) ??
    item?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
  element?.focus({ preventScroll: false });
  return !!element && document.activeElement === element;
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

/** Event telling lists that a "focus newest on arrival" request was made. */
const FOCUS_ON_ARRIVAL_EVENT = 'nicolium:focus-on-arrival';

/** Strip the trailing slash index routes have in their match pathname. */
const normalizePathname = (pathname = '') => pathname.replace(/(.)\/+$/u, '$1');

/** Pending request to focus the newest entry of the main list of the page being navigated to. */
let arrivalRequest: { pathname: string; fromKey: string | undefined; expires: number } | null =
  null;

/**
 * Ask the main list of the page at `pathname` to focus its newest entry once it has loaded.
 * Call before navigating, with the key of the location being left.
 */
const requestFocusNewestOnArrival = (pathname: string, fromKey: string | undefined) => {
  arrivalRequest = { pathname, fromKey, expires: Date.now() + 5_000 };
  document.dispatchEvent(new Event(FOCUS_ON_ARRIVAL_EVENT));
};

/**
 * Call `handler` when a "focus newest on arrival" request targets the list marked with `listId`,
 * which belongs to the page at `pathname` shown at the location with key `locationKey`,
 * once `ready` is true.
 */
const useFocusNewestOnArrival = (
  listId: string,
  pathname: string | undefined,
  locationKey: string | undefined,
  ready: boolean,
  handler: () => void,
) => {
  const [requestCount, setRequestCount] = useState(0);
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    const listener = () => setRequestCount((count) => count + 1);
    document.addEventListener(FOCUS_ON_ARRIVAL_EVENT, listener);
    return () => document.removeEventListener(FOCUS_ON_ARRIVAL_EVENT, listener);
  }, []);

  useEffect(() => {
    if (!arrivalRequest || !ready) return;
    if (Date.now() > arrivalRequest.expires) {
      arrivalRequest = null;
      return;
    }
    // The page being left keeps rendering for a moment with the new location,
    // so match on the page the list belongs to rather than on the location.
    if (
      normalizePathname(arrivalRequest.pathname) !== normalizePathname(pathname) ||
      arrivalRequest.fromKey === locationKey
    ) {
      return;
    }

    // Focus can fail while Virtuoso keeps the list hidden, so try until it lands.
    let attempts = 0;
    let timeout: ReturnType<typeof setTimeout>;
    const attempt = () => {
      if (!arrivalRequest) return;
      const list = document.querySelector(`[${FOCUS_LIST_ATTRIBUTE}="${listId}"]`);
      if ((list && list.contains(document.activeElement)) || ++attempts > 10) {
        arrivalRequest = null;
        return;
      }
      if (list && findList() === list) handlerRef.current();
      timeout = setTimeout(attempt, 150);
    };
    timeout = setTimeout(attempt, 0);
    return () => clearTimeout(timeout);
  }, [listId, pathname, locationKey, ready, requestCount]);
};

export {
  FOCUS_LIST_ATTRIBUTE,
  focusListEdge,
  focusListItem,
  focusNewestInList,
  requestFocusNewestOnArrival,
  useFocusNewest,
  useFocusNewestOnArrival,
};
