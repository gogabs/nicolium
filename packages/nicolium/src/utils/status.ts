import { defineMessages, type IntlShape } from 'react-intl';

import { selectAccount } from '@/queries/accounts/selectors';
import { queryClient } from '@/queries/client';
import { queryKeys } from '@/queries/keys';
import { scopedQueryKey } from '@/queries/query';

import type { NormalizedStatus as Status } from '@/queries/statuses/normalize';
import type { SelectedStatus } from '@/queries/statuses/use-status';

/** Grab the first external link from a status. */
const getFirstExternalLink = (status: Pick<Status, 'content'>): HTMLAnchorElement | null => {
  try {
    // Pulled from Pleroma's media parser
    const selector = 'a:not(.mention,.hashtag,.attachment,[rel~="tag"])';
    const element = document.createElement('div');
    element.innerHTML = status.content;
    return element.querySelector(selector);
  } catch {
    return null;
  }
};

/** Whether the status is expected to have a Card after it loads. */
const shouldHaveCard = (status: Pick<Status, 'content'>): boolean =>
  Boolean(getFirstExternalLink(status));

const messages = defineMessages({
  replyTo: { id: 'status.a11y.reply_to', defaultMessage: 'replying to {names}' },
  threadContinuation: {
    id: 'status.a11y.thread_continuation',
    defaultMessage: 'continuing thread',
  },
  mentioning: { id: 'status.a11y.mentioning', defaultMessage: 'mentioning {names}' },
  contentWarning: { id: 'status.a11y.content_warning', defaultMessage: 'content warning: {text}' },
  image: { id: 'status.a11y.image', defaultMessage: 'image: {description}' },
  imageNoDescription: {
    id: 'status.a11y.image_no_description',
    defaultMessage: 'image without description',
  },
  video: { id: 'status.a11y.video', defaultMessage: 'video: {description}' },
  videoNoDescription: {
    id: 'status.a11y.video_no_description',
    defaultMessage: 'video without description',
  },
  audio: { id: 'status.a11y.audio', defaultMessage: 'audio: {description}' },
  audioNoDescription: {
    id: 'status.a11y.audio_no_description',
    defaultMessage: 'audio without description',
  },
  attachment: { id: 'status.a11y.attachment', defaultMessage: 'attachment: {description}' },
  attachmentNoDescription: {
    id: 'status.a11y.attachment_no_description',
    defaultMessage: 'attachment without description',
  },
  poll: { id: 'status.a11y.poll', defaultMessage: 'poll: {options}' },
  quote: { id: 'status.a11y.quote', defaultMessage: 'quoting {name}: {text}' },
  unlisted: { id: 'status.a11y.visibility.unlisted', defaultMessage: 'unlisted' },
  private: { id: 'status.a11y.visibility.private', defaultMessage: 'followers only' },
  direct: { id: 'status.a11y.visibility.direct', defaultMessage: 'direct message' },
  rebloggedBy: { id: 'status.a11y.reblogged_by', defaultMessage: 'reposted by {name}' },
});

type LabelStatus = Pick<
  SelectedStatus,
  | 'account'
  | 'spoiler_text'
  | 'search_index'
  | 'content'
  | 'created_at'
  | 'mentions'
  | 'in_reply_to_id'
  | 'in_reply_to_account_id'
  | 'media_attachments'
  | 'poll_id'
  | 'visibility'
> & { quote?: SelectedStatus | null };

const displayNameFor = (account: Pick<SelectedStatus['account'], 'display_name' | 'acct'>) =>
  account.display_name.trim() || account.acct.split('@')[0];

/** Plain text of the status body, without the spoiler and poll options appended to the search index. */
const plainTextFor = (status: Pick<SelectedStatus, 'content'>) => {
  const element = document.createElement('div');
  element.innerHTML = status.content.replace(/<br\s*\/?>/giu, '\n').replace(/<\/p>/giu, '\n');
  element.querySelectorAll('.quote-inline, .reply-mention-inline').forEach((node) => node.remove());
  return (element.textContent ?? '').replace(/\s+/gu, ' ').trim();
};

const relativeTime = (intl: IntlShape, date: string) => {
  const seconds = Math.round((new Date(date).getTime() - Date.now()) / 1000);
  const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ['year', 365 * 24 * 60 * 60],
    ['month', 30 * 24 * 60 * 60],
    ['day', 24 * 60 * 60],
    ['hour', 60 * 60],
    ['minute', 60],
  ];
  for (const [unit, size] of units) {
    if (Math.abs(seconds) >= size) {
      return intl.formatRelativeTime(Math.round(seconds / size), unit, { numeric: 'auto' });
    }
  }
  return intl.formatRelativeTime(0, 'second', { numeric: 'auto' });
};

const attachmentLabel = (
  intl: IntlShape,
  attachment: SelectedStatus['media_attachments'][number],
) => {
  const description = attachment.description?.trim();
  const [withText, withoutText] = {
    image: [messages.image, messages.imageNoDescription],
    gifv: [messages.image, messages.imageNoDescription],
    video: [messages.video, messages.videoNoDescription],
    audio: [messages.audio, messages.audioNoDescription],
  }[attachment.type as string] ?? [messages.attachment, messages.attachmentNoDescription];
  return description
    ? intl.formatMessage(withText, { description })
    : intl.formatMessage(withoutText);
};

/**
 * Accessible name of a status, read by screen readers when the status gets focus.
 *
 * Order: author name and handle, reply context, content warning and text, attachments, poll,
 * quote, relative time, visibility (when not public), reposter.
 */
const textForScreenReader = (
  intl: IntlShape,
  status: LabelStatus,
  options: {
    /** Accounts which reposted the status, either as objects or IDs of cached accounts. */
    rebloggedBy?: Array<Pick<SelectedStatus['account'], 'display_name' | 'acct'> | string>;
    spoilerExpanded?: boolean;
    scopeUrl: string;
  },
): string => {
  const { account } = status;
  if (!account || typeof account !== 'object') return '';

  const values: string[] = [displayNameFor(account), `@${account.acct}`];

  if (status.in_reply_to_id) {
    // A reply to one's own status continues a thread rather than answering someone.
    const isSelfReply = status.in_reply_to_account_id === account.id;
    const mentions = isSelfReply
      ? status.mentions.filter(({ id }) => id !== account.id)
      : status.mentions;
    const names = intl.formatList(mentions.map(({ acct }) => `@${acct.split('@')[0]}`));

    if (isSelfReply) {
      values.push(intl.formatMessage(messages.threadContinuation));
      if (mentions.length > 0) values.push(intl.formatMessage(messages.mentioning, { names }));
    } else if (mentions.length > 0) {
      values.push(intl.formatMessage(messages.replyTo, { names }));
    }
  }

  const text = plainTextFor(status);
  if (status.spoiler_text) {
    values.push(intl.formatMessage(messages.contentWarning, { text: status.spoiler_text }));
    if (options.spoilerExpanded && text) values.push(text);
  } else if (text) {
    values.push(text);
  }

  for (const attachment of status.media_attachments) {
    values.push(attachmentLabel(intl, attachment));
  }

  if (status.poll_id) {
    const poll = queryClient.getQueryData(
      scopedQueryKey(queryKeys.statuses.polls.show(status.poll_id), options.scopeUrl),
    );
    if (poll) {
      values.push(
        intl.formatMessage(messages.poll, {
          options: intl.formatList(
            poll.options.map(({ title }) => title),
            { type: 'disjunction' },
          ),
        }),
      );
    }
  }

  if (status.quote?.account) {
    values.push(
      intl.formatMessage(messages.quote, {
        name: displayNameFor(status.quote.account),
        text: plainTextFor(status.quote),
      }),
    );
  }

  values.push(relativeTime(intl, status.created_at));

  if (
    status.visibility === 'unlisted' ||
    status.visibility === 'private' ||
    status.visibility === 'direct'
  ) {
    values.push(intl.formatMessage(messages[status.visibility]));
  }

  const rebloggedBy = (options.rebloggedBy ?? [])
    .map((reblogger) =>
      typeof reblogger === 'string' ? selectAccount(reblogger, options.scopeUrl) : reblogger,
    )
    .filter((reblogger) => !!reblogger && typeof reblogger === 'object')
    .map((reblogger) => displayNameFor(reblogger!));
  if (rebloggedBy.length > 0) {
    values.push(intl.formatMessage(messages.rebloggedBy, { name: intl.formatList(rebloggedBy) }));
  }

  return values.filter(Boolean).join(', ');
};

const getStatusIdsFromLinksInContent = (content: string): string[] => {
  const urls = content.match(
    RegExp(`${window.location.origin}/@([a-z\\d_-]+(?:@[^@\\s]+)?)/posts/[a-z0-9]+(?!\\S)`, 'gi'),
  );

  if (!urls) return [];

  return Array.from(
    new Set(urls.map((url) => url.split('/').at(-1) as string).filter((url) => url)),
  );
};

export { shouldHaveCard, textForScreenReader, getStatusIdsFromLinksInContent };
