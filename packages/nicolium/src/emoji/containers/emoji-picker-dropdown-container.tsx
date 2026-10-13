import { useFloating, shift, flip, autoUpdate } from '@floating-ui/react';
import iconSmiley from '@phosphor-icons/core/regular/smiley.svg';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { defineMessages, useIntl } from 'react-intl';

import IconButton from '@/components/ui/icon-button';
import Portal from '@/components/ui/portal';
import { useClickOutside } from '@/hooks/use-click-outside';
import { useTransitionStyles } from '@/hooks/use-transition-styles';

import EmojiPickerDropdown, {
  type IEmojiPickerDropdown,
} from '../components/emoji-picker-dropdown';

const messages = defineMessages({
  emoji: { id: 'emoji_button.label', defaultMessage: 'Insert emoji' },
});

interface IEmojiPickerDropdownContainer extends Pick<
  IEmojiPickerDropdown,
  'onPickEmoji' | 'condensed' | 'withCustom'
> {
  children?: React.JSX.Element;
}

const EmojiPickerDropdownContainer: React.FC<IEmojiPickerDropdownContainer> = ({
  children,
  ...props
}) => {
  const intl = useIntl();
  const title = intl.formatMessage(messages.emoji);
  const [isOpen, setIsOpen] = useState<boolean>(false);

  const { x, y, strategy, refs, update, context, placement } = useFloating<HTMLButtonElement>({
    open: isOpen,
    middleware: [flip(), shift()],
    whileElementsMounted: autoUpdate,
  });

  const { isMounted, styles } = useTransitionStyles(context, {
    initial: {
      opacity: 0,
      transform: 'scale(0.8)',
      transformOrigin: placement === 'bottom' ? 'top' : 'bottom',
    },
    duration: {
      open: 100,
      close: 100,
    },
  });

  useClickOutside(refs, () => {
    setIsOpen(false);
  });

  // When the picker closes with focus inside it (after picking an emoji or
  // pressing Escape), return focus to the button that opened it.
  const wasOpen = useRef(false);
  useEffect(() => {
    if (wasOpen.current && !isOpen) {
      const { activeElement } = document;
      if (
        !activeElement ||
        activeElement === document.body ||
        refs.floating.current?.contains(activeElement)
      ) {
        refs.domReference.current?.focus();
      }
    }

    wasOpen.current = isOpen;
  }, [isOpen]);

  const handleClick: React.MouseEventHandler<HTMLButtonElement> = (e) => {
    e.stopPropagation();
    e.preventDefault();
    setIsOpen(!isOpen);
  };

  const handleKeyDown: React.KeyboardEventHandler<HTMLButtonElement> = (e) => {
    if (['Enter', ' '].includes(e.key)) {
      e.stopPropagation();
      e.preventDefault();
      setIsOpen(!isOpen);
    }
  };

  const clonedChildren = useMemo(
    () =>
      children
        ? React.cloneElement(children, {
            onClick: handleClick,
            onKeyDown: handleKeyDown,
            ref: refs.setReference,
            'aria-haspopup': 'dialog',
            'aria-expanded': isOpen,
          })
        : null,
    [children, isOpen],
  );

  return (
    <div className='emoji-picker-dropdown__container'>
      {clonedChildren ?? (
        <IconButton
          theme='transparent'
          ref={refs.setReference}
          src={iconSmiley}
          title={title}
          aria-label={title}
          aria-haspopup='dialog'
          aria-expanded={isOpen}
          role='button'
          onClick={handleClick}
          onKeyDown={handleKeyDown}
          tabIndex={0}
        />
      )}

      {isMounted && (
        <Portal>
          <div
            className='emoji-picker-dropdown'
            ref={refs.setFloating}
            style={{
              position: strategy,
              top: y ?? 0,
              left: x ?? 0,
              width: 'max-content',
              ...styles,
            }}
          >
            <EmojiPickerDropdown visible setVisible={setIsOpen} update={update} {...props} />
          </div>
        </Portal>
      )}
    </div>
  );
};

export { messages, EmojiPickerDropdownContainer as default };
