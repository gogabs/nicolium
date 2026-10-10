import { ActivityIndicator, Divider, useTheme } from '@mkljczk/react-native-paper';
import {
  createNativeStackNavigator,
  type NativeStackScreenProps,
} from '@react-navigation/native-stack';
import { FlashList } from '@shopify/flash-list';
import React from 'react';
import { defineMessages, FormattedMessage, useIntl } from 'react-intl';
import { View } from 'react-native';
import { Tabs, TabScreen, TabsProvider } from 'react-native-paper-tabs';

import { Notification } from '@/components/notification';
import { EmptyMessage } from '@/components/ui/empty-message';
import { Header } from '@/components/ui/header';
import { LoadMore } from '@/components/ui/load-more';
import { useNotifications } from '@/queries/notifications/use-notifications';
import { useSetting } from '@/stores/settings';

import type { NotificationsStackParams } from '../router';

const messages = defineMessages({
  tabAll: { id: 'notifications.filter.all', defaultMessage: 'All' },
  tabMentions: { id: 'notifications.filter_mentions', defaultMessage: 'Mentions' },
});

const LoadingIndicator = () => (
  <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
    <ActivityIndicator size='large' />
  </View>
);

const NotificationsScreen = (_props: NativeStackScreenProps<NotificationsStackParams, 'view'>) => {
  const intl = useIntl();
  const { colors } = useTheme();

  const filters = useSetting('notifications.filters');

  const [currentTab, setCurrentTab] = React.useState<'all' | 'mentions'>('all');

  const notificationsQuery = useNotifications(filters, currentTab === 'all');
  const mentionsNotificationsQuery = useNotifications(['mention'], currentTab === 'mentions');

  const autoloadMore = useSetting('timelines.autoloadMore');

  const handleChangeIndex = (index: number) => setCurrentTab(index ? 'mentions' : 'all');

  const renderNotifications = (tab: 'all' | 'mentions') => {
    const query = tab === 'all' ? notificationsQuery : mentionsNotificationsQuery;

    if (query.isPending) return <LoadingIndicator />;

    return (
      <FlashList
        data={query.data}
        renderItem={({ item }) => (
          <Notification key={item.most_recent_notification_id} notification={item} />
        )}
        ItemSeparatorComponent={Divider}
        onEndReached={
          autoloadMore && query.hasNextPage && !query.isFetching ? query.fetchNextPage : undefined
        }
        onEndReachedThreshold={0.1}
        ListEmptyComponent={
          !query.isPending ? (
            tab === 'all' ? (
              <EmptyMessage
                emptyMessageText={
                  <FormattedMessage
                    id='empty_column.notifications'
                    defaultMessage='You don’t have any notifications yet. Interact with others to start the conversation.'
                  />
                }
              />
            ) : (
              <EmptyMessage
                emptyMessageText={
                  <FormattedMessage
                    id='empty_column.notifications_filtered'
                    defaultMessage='You don’t have any notifications of this type yet.'
                  />
                }
              />
            )
          ) : null
        }
        ListFooterComponent={<LoadMore query={query} />}
      />
    );
  };

  return (
    <TabsProvider defaultIndex={0} onChangeIndex={handleChangeIndex}>
      <Tabs style={{ backgroundColor: colors.surfaceContainer }} uppercase={false}>
        <TabScreen label={intl.formatMessage(messages.tabAll)}>
          {renderNotifications('all')}
        </TabScreen>
        <TabScreen label={intl.formatMessage(messages.tabMentions)}>
          {renderNotifications('mentions')}
        </TabScreen>
      </Tabs>
    </TabsProvider>
  );
};

const NotificationsStack = createNativeStackNavigator<NotificationsStackParams>();

const NotificationsStackScreen = () => {
  return (
    <NotificationsStack.Navigator>
      <NotificationsStack.Screen
        name='view'
        component={NotificationsScreen}
        options={{ header: Header, title: 'Notifications' }}
      />
    </NotificationsStack.Navigator>
  );
};

export { NotificationsStackScreen };
