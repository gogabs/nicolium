import {
  Carousel,
  CarouselItem,
  Chip,
  IconButton,
  Tooltip,
  useTheme,
} from '@mkljczk/react-native-paper';
import { useIsFocused } from '@react-navigation/native';
import { GlassView, isGlassEffectAPIAvailable } from 'expo-glass-effect';
import { Image } from 'expo-image';
import { useVideoPlayer, VideoView } from 'expo-video';
import { PlayIcon } from 'phosphor-react-native';
import React, { useEffect, useState } from 'react';
import { defineMessages, useIntl } from 'react-intl';
import { Platform, Pressable, StyleSheet, View } from 'react-native';

import type { SelectedStatus } from '@/queries/statuses/use-status';

const messages = defineMessages({
  altIndicator: { id: 'upload_form.description_missing.indicator', defaultMessage: 'Alt' },
  altHeading: { id: 'media_gallery.description', defaultMessage: 'Image description' },
  altHeadingVideo: { id: 'media_gallery.description.video', defaultMessage: 'Video description' },
  play: { id: 'video.play', defaultMessage: 'Play' },
});

type MediaAttachment = SelectedStatus['media_attachments'][number];
type SupportedMediaAttachment = Extract<MediaAttachment, { type: 'image' | 'video' | 'gifv' }>;

const isSupportedMedia = (media: MediaAttachment): media is SupportedMediaAttachment =>
  media.type === 'image' || media.type === 'video' || media.type === 'gifv';

interface IStatusImage {
  media: SupportedMediaAttachment;
  uri: string;
}

const StatusImage: React.FC<IStatusImage> = ({ media, uri }) => {
  const { width, height } = media.meta.original || {};

  return (
    <Image
      style={{ flex: 1 }}
      source={{ uri, width, height }}
      placeholder={{
        blurhash: (Platform.OS !== 'web' && media.blurhash) || undefined,
        width,
        height,
      }}
      accessibilityLabel={media.description}
      contentFit='cover'
      transition={300}
      recyclingKey={media.id}
    />
  );
};

interface IMediaVideo {
  media: Extract<MediaAttachment, { type: 'video' | 'gifv' }>;
}

const StatusGifv: React.FC<IMediaVideo> = ({ media }) => {
  const isFocused = useIsFocused();
  const player = useVideoPlayer(media.url, (player) => {
    player.loop = true;
    player.muted = true;
    player.audioMixingMode = 'mixWithOthers';
  });

  useEffect(() => {
    if (isFocused) player.play();
    else player.pause();
  }, [isFocused, player]);

  return (
    <VideoView
      player={player}
      style={{ flex: 1 }}
      contentFit='cover'
      nativeControls={false}
      surfaceType='textureView'
      accessibilityLabel={media.description}
    />
  );
};

const StatusVideoPlayer: React.FC<IMediaVideo> = ({ media }) => {
  const { colors } = useTheme();
  const isFocused = useIsFocused();
  const player = useVideoPlayer(media.url, (player) => {
    player.play();
  });

  useEffect(() => {
    if (!isFocused) player.pause();
  }, [isFocused, player]);

  return (
    <VideoView
      player={player}
      style={{ flex: 1, backgroundColor: colors.scrim }}
      contentFit='contain'
      fullscreenOptions={{ enable: true }}
      surfaceType='textureView'
      accessibilityLabel={media.description}
    />
  );
};

const StatusVideo: React.FC<IMediaVideo> = ({ media }) => {
  const intl = useIntl();
  const [active, setActive] = useState(false);

  const glassEffect = isGlassEffectAPIAvailable();

  return (
    <View style={{ flex: 1 }} onStartShouldSetResponder={() => true}>
      {active ? (
        <StatusVideoPlayer media={media} />
      ) : (
        <>
          <StatusImage media={media} uri={media.preview_url} />
          <View
            style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}
          >
            {glassEffect ? (
              <Pressable
                onPress={() => setActive(true)}
                accessibilityLabel={intl.formatMessage(messages.play)}
              >
                <GlassView
                  style={{ borderRadius: 36, padding: 16 }}
                  glassEffectStyle='clear'
                  isInteractive
                >
                  <PlayIcon weight='fill' size={40} color='#fff' />
                </GlassView>
              </Pressable>
            ) : (
              <IconButton
                mode='contained'
                icon={(props) => <PlayIcon {...props} weight='fill' />}
                onPress={() => setActive(true)}
                accessibilityLabel={intl.formatMessage(messages.play)}
              />
            )}
          </View>
        </>
      )}
    </View>
  );
};

const renderMedia = (media: SupportedMediaAttachment) => {
  switch (media.type) {
    case 'image':
      return <StatusImage media={media} uri={media.url} />;
    case 'gifv':
      return <StatusGifv media={media} />;
    case 'video':
      return <StatusVideo media={media} />;
  }
};

interface IStatusMedia {
  status: SelectedStatus;
  compact?: boolean;
}

const StatusMedia: React.FC<IStatusMedia> = ({ status, compact }) => {
  const intl = useIntl();
  const { colors, shapes } = useTheme();

  const filteredMedia = status.media_attachments.filter(isSupportedMedia);

  // const unsupportedMedia = status.media_attachments

  if (!filteredMedia.length) return null;

  const renderItem = (media: SupportedMediaAttachment, multiple = filteredMedia.length > 1) => (
    <View
      key={media.id}
      style={{
        flex: 1,
        width: '100%',
        height: multiple ? '100%' : compact ? 160 : 320,
        position: 'relative',
        borderRadius: shapes.corner.medium,
        overflow: 'hidden',
      }}
    >
      {renderMedia(media)}
      {media.description && (
        <View style={{ position: 'absolute', bottom: 16, right: 16 }}>
          <Tooltip.Rich
            title={intl.formatMessage(
              media.type === 'image' ? messages.altHeading : messages.altHeadingVideo,
            )}
            content={media.description}
          >
            {(props) => (
              <Chip {...props} mode='outlined' compact>
                {intl.formatMessage(messages.altIndicator).toUpperCase()}
              </Chip>
            )}
          </Tooltip.Rich>
        </View>
      )}
    </View>
  );

  if (filteredMedia.length === 1) return renderItem(filteredMedia[0]);

  return (
    <Carousel
      data={filteredMedia}
      height={compact ? 160 : 320}
      renderItem={({ item: media, index, mask }) => (
        <CarouselItem
          mask={mask}
          style={{ flexDirection: 'row', gap: 8, backgroundColor: colors.background }}
        >
          {index !== 0 && index === filteredMedia.length - 1 && <View aria-hidden />}
          {renderItem(media)}
          {index !== filteredMedia.length - 1 && <View aria-hidden />}
        </CarouselItem>
      )}
    />
  );
};

export { StatusMedia };
