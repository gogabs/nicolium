import { useNavigation } from '@react-navigation/native';
import React from 'react';

import { useAccount } from '@/queries/accounts/use-account';

import { type IUIAccount, UIAccount } from '../ui/account';

import { ActionButton } from './action-button';

interface IAccount extends Pick<IUIAccount, 'action' | 'onPress' | 'style'> {
  id: string;
  timestamp?: string;
  withLink?: boolean;
  fullWidthPressable?: boolean;
  displayFqn?: boolean;
  withFollowButton?: boolean;
  actionType?: 'follow_request' | 'biting';
}

const Account: React.FC<IAccount> = ({
  id,
  withLink,
  displayFqn,
  withFollowButton,
  actionType,
  action,
  ...props
}) => {
  const navigation = useNavigation();

  const { data: account } = useAccount(id);

  if (!account) return null;

  const pronouns = account.pronouns.length
    ? account.pronouns.join('/')
    : account.fields.find(
        ({ name, value }) =>
          name.toLocaleLowerCase().includes('pronouns') &&
          value.length <= 24 &&
          !value.startsWith('<'),
      )?.value;

  return (
    <UIAccount
      avatarSrc={account.avatar_default ? undefined : account.avatar}
      displayName={account.display_name}
      displayNameDetail={pronouns}
      emojis={account.emojis}
      acct={displayFqn ? account.fqn : account.acct}
      onPress={
        withLink
          ? () => navigation.navigate('accounts', { screen: 'view', params: { id } })
          : undefined
      }
      action={
        action ||
        (withFollowButton || actionType ? (
          <ActionButton id={id} actionType={actionType} />
        ) : undefined)
      }
      {...props}
    />
  );
};

export { Account };
