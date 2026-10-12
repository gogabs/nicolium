/** Event asking the timeline containing `detail.feed` to focus its most recent entry. */
const FOCUS_NEWEST_EVENT = 'nicolium:focus-newest';

/**
 * Focus the most recent entry of the timeline the user is in: the deck column holding
 * the focused element, or the first timeline on the page.
 */
const focusNewestInTimeline = (): boolean => {
  const scope = document.activeElement?.closest('.deck__column') ?? document;
  const feed = scope.querySelector('[role="feed"]') ?? document.querySelector('[role="feed"]');
  if (!feed) return false;

  document.dispatchEvent(new CustomEvent(FOCUS_NEWEST_EVENT, { detail: { feed } }));
  return true;
};

export { FOCUS_NEWEST_EVENT, focusNewestInTimeline };
