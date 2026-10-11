import { FAB, Icon } from '@mkljczk/react-native-paper';
import { GlassView, isGlassEffectAPIAvailable } from 'expo-glass-effect';
import { NotePencilIcon } from 'phosphor-react-native';
import React, { useEffect } from 'react';
import { defineMessages, useIntl } from 'react-intl';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-screens/experimental';

import { useUiStoreActions } from '@/stores/ui';

import { iconHelper } from './ui/icon';

const messages = defineMessages({
  compose: { id: 'navigation.compose', defaultMessage: 'Compose' },
});

interface IComposeButton {
  visible: boolean;
}

const ComposeButton: React.FC<IComposeButton> = ({ visible }) => {
  const intl = useIntl();
  const glassEffect = isGlassEffectAPIAvailable();
  const iconOpacity = useSharedValue(+visible);

  const { openCompose } = useUiStoreActions();

  const iconStyle = useAnimatedStyle(() => ({
    opacity: iconOpacity.value,
  }));

  useEffect(() => {
    iconOpacity.value = withTiming(+visible, { duration: 250 });
  }, [visible, iconOpacity]);

  let button;

  if (glassEffect) {
    button = (
      <Pressable
        onPress={openCompose}
        accessibilityLabel={intl.formatMessage(messages.compose)}
        style={{
          position: 'absolute',
          margin: 16,
          right: 0,
          bottom: 0,
          pointerEvents: visible ? 'auto' : 'none',
        }}
      >
        <GlassView
          glassEffectStyle={{
            style: visible ? 'regular' : 'none',
            animate: true,
          }}
          isInteractive
          style={{
            height: 56,
            width: 56,
            padding: 16,
            borderRadius: 28,
          }}
        >
          <Animated.View style={iconStyle}>
            <Icon source={iconHelper(NotePencilIcon)} size={24} />
          </Animated.View>
        </GlassView>
      </Pressable>
    );
  } else {
    button = (
      <FAB
        onPress={openCompose}
        icon={iconHelper(NotePencilIcon)}
        style={{
          position: 'absolute',
          margin: 16,
          right: 0,
          bottom: 0,
        }}
        visible={visible}
        aria-label={intl.formatMessage(messages.compose)}
      />
    );
  }

  if (Platform.OS === 'ios') {
    return (
      <SafeAreaView
        edges={{ bottom: true }}
        style={StyleSheet.absoluteFill}
        pointerEvents='box-none'
      >
        <View style={{ flex: 1 }} pointerEvents='box-none'>
          {button}
        </View>
      </SafeAreaView>
    );
  }

  return button;
};

export { ComposeButton };
