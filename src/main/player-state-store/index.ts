import { EventEmitter } from "events";

export enum VideoState {
  Unknown = -1,
  Paused = 0,
  Playing = 1,
  Buffering = 2
}

export enum RepeatMode {
  Unknown = -1,
  None = 0,
  All = 1,
  One = 2
}

export enum LikeStatus {
  Unknown = -1,
  Dislike = 0,
  Indifferent = 1,
  Like = 2
}

export enum VideoType {
  Unknown = -1,
  MusicAudio = 0,
  MusicVideo = 1,
  MusicUploaded = 2,
  PodcastEpisode = 3
}

export type Thumbnail = {
  height: number;
  url: string;
  width: number;
};

export type VideoDetails = {
  album: string;
  albumId: string;
  author: string;
  channelId: string;
  durationSeconds: number;
  thumbnails: Thumbnail[];
  title: string;
  id: string;
  likeStatus: LikeStatus;
  videoType: VideoType;
  isLive: boolean;
};

export type PlayerQueueItem = {
  thumbnails: Thumbnail[];
  title: string;
  author: string;
  duration: string;
  selected: boolean;
  videoId: string;
  counterparts: PlayerQueueItem[];
};

export type PlayerQueue = {
  automixItems: PlayerQueueItem[];
  autoplay: boolean;
  isGenerating: boolean;
  isInfinite: boolean;
  items: PlayerQueueItem[];
  repeatMode: RepeatMode;
  selectedItemIndex: number;
};

export type PlayerState = {
  videoDetails: VideoDetails;
  playlistId: string;
  trackState: VideoState;
  queue: PlayerQueue;
  videoProgress: number;
  volume: number;
  muted: boolean;
  adPlaying: boolean;
  hasFullMetadata: boolean;
};

enum YTVideoState {
  Unstarted = -1,
  Ended = 0,
  Playing = 1,
  Paused = 2,
  Buffering = 3,
  VideoCued = 5
}

type YTThumbnail = {
  height: number;
  url: string;
  width: number;
};

type YTTextRun = {
  text: string;
};

type YTText = {
  runs: YTTextRun[];
};

type YTPlayerQueueItemVideoRenderer = {
  lengthText: YTText;
  selected: boolean;
  shortBylineText: YTText;
  thumbnail: {
    thumbnails: YTThumbnail[];
  };
  title: YTText;
  videoId: string;
};

type YTPlayerQueueItemCounterpart = {
  counterpartRenderer: {
    playlistPanelVideoRenderer: YTPlayerQueueItemVideoRenderer;
  };
};

type YTPlayerQueueItem = {
  playlistPanelVideoRenderer: YTPlayerQueueItemVideoRenderer | null;
  playlistPanelVideoWrapperRenderer: {
    primaryRenderer: {
      playlistPanelVideoRenderer: YTPlayerQueueItemVideoRenderer;
    };
    counterpart: YTPlayerQueueItemCounterpart[];
  } | null;
};

type YTRepeatMode = "NONE" | "ALL" | "ONE";

type YTLikeStatus = "INDIFFERENT" | "DISLIKE" | "LIKE";

type YTPlayerQueue = {
  automixItems: YTPlayerQueueItem[];
  autoplay: boolean;
  isGenerating: boolean;
  isInfinite: boolean;
  items: YTPlayerQueueItem[];
  repeatMode: YTRepeatMode;
};

type YTVideoDetails = {
  album: string;
  author: string;
  channelId: string;
  lengthSeconds: string;
  thumbnail: {
    thumbnails: YTThumbnail[];
  };
  title: string;
  videoId: string;
  isLive: boolean;
  musicVideoType: string;
};

function getYTTextRun(runs: YTTextRun[]) {
  let final = "";
  for (const run of runs) {
    final += run.text;
  }
  return final;
}

function mapYTThumbnails(thumbnail: YTThumbnail) {
  // Explicit mapping to keep a consistent API
  // If YouTube changes how this is presented internally then it's easier to update without breaking the API
  return {
    url: thumbnail.url,
    width: thumbnail.width,
    height: thumbnail.height
  };
}

function mapCounterpart(counterpart: YTPlayerQueueItemCounterpart) {
  // Explicit mapping to keep a consistent API
  // If YouTube changes how this is presented internally then it's easier to update without breaking the API
  return transformPlaylistPanelVideoRenderer(counterpart.counterpartRenderer.playlistPanelVideoRenderer);
}

function transformPlaylistPanelVideoRenderer(
  playlistPanelVideoRenderer: YTPlayerQueueItemVideoRenderer,
  counterpart?: YTPlayerQueueItemCounterpart[]
): PlayerQueueItem {
  return {
    thumbnails: playlistPanelVideoRenderer.thumbnail ? playlistPanelVideoRenderer.thumbnail.thumbnails.map(mapYTThumbnails) : [],
    title: getYTTextRun(playlistPanelVideoRenderer.title?.runs ?? [{ text: "" }]),
    author: getYTTextRun(playlistPanelVideoRenderer.shortBylineText?.runs ?? [{ text: "" }]),
    duration: getYTTextRun(playlistPanelVideoRenderer.lengthText?.runs ?? [{ text: "" }]),
    selected: playlistPanelVideoRenderer.selected,
    videoId: playlistPanelVideoRenderer.videoId,
    counterparts: counterpart ? counterpart.map(mapCounterpart) : null
  };
}

function mapYTQueueItems(item: YTPlayerQueueItem): PlayerQueueItem {
  let playlistPanelVideoRenderer;
  let counterpart;
  if (item.playlistPanelVideoRenderer) {
    playlistPanelVideoRenderer = item.playlistPanelVideoRenderer;
  } else if (item.playlistPanelVideoWrapperRenderer) {
    playlistPanelVideoRenderer = item.playlistPanelVideoWrapperRenderer.primaryRenderer.playlistPanelVideoRenderer;
    counterpart = item.playlistPanelVideoWrapperRenderer.counterpart;
  }

  // This probably shouldn't happen but in the off chance it does we need to return nothing
  if (!playlistPanelVideoRenderer) return null;

  return transformPlaylistPanelVideoRenderer(playlistPanelVideoRenderer, counterpart);
}

// This may seem redundant but we do this in case YouTube changes its own data to accommodate and prevent severe breaking of things
function transformRepeatMode(repeatMode: YTRepeatMode) {
  switch (repeatMode) {
    case "NONE": {
      return RepeatMode.None;
    }

    case "ALL": {
      return RepeatMode.All;
    }

    case "ONE": {
      return RepeatMode.One;
    }

    default: {
      return RepeatMode.Unknown;
    }
  }
}

function transformLikeStatus(likeStatus: YTLikeStatus) {
  switch (likeStatus) {
    case "DISLIKE": {
      return LikeStatus.Dislike;
    }

    case "INDIFFERENT": {
      return LikeStatus.Indifferent;
    }

    case "LIKE": {
      return LikeStatus.Like;
    }

    default: {
      return LikeStatus.Unknown;
    }
  }
}

function transformVideoType(videoType: string) {
  switch (videoType) {
    case "MUSIC_VIDEO_TYPE_ATV": {
      return VideoType.MusicAudio;
    }

    case "MUSIC_VIDEO_TYPE_OMV":
    case "MUSIC_VIDEO_TYPE_UGC": {
      return VideoType.MusicVideo;
    }

    case "MUSIC_VIDEO_TYPE_PRIVATELY_OWNED_TRACK": {
      return VideoType.MusicUploaded;
    }

    case "MUSIC_VIDEO_TYPE_PODCAST_EPISODE": {
      return VideoType.PodcastEpisode;
    }

    default: {
      return VideoType.Unknown;
    }
  }
}

class PlayerStateStore {
  private videoProgress = 0;
  private state: VideoState = -1;
  private videoDetails: VideoDetails | null = null;
  private playlistId: string | null = null;
  private queue: PlayerQueue | null = null;
  private volume: number = 0;
  private muted: boolean = false;
  private adPlaying: boolean = false;
  private hasFullMetadata: boolean = false;
  private eventEmitter = new EventEmitter();

  constructor() {
    this.eventEmitter.on("error", error => {
      console.log("PlayerStateStore EventEmitter threw an error", error);
    });
  }

  public getState(): PlayerState {
    return {
      videoDetails: this.videoDetails,
      playlistId: this.playlistId,
      trackState: this.state,
      queue: this.queue,
      videoProgress: this.videoProgress,
      volume: this.volume,
      muted: this.muted,
      adPlaying: this.adPlaying,
      hasFullMetadata: this.hasFullMetadata
    };
  }

  public getQueue() {
    return this.queue;
  }

  public getPlaylistId() {
    return this.playlistId;
  }

  public updateVideoProgress(progress: number) {
    this.videoProgress = progress;
    this.eventEmitter.emit("stateChanged", this.getState());
  }

  public updateVideoState(state: YTVideoState) {
    switch (state) {
      case YTVideoState.Paused: {
        this.state = VideoState.Paused;
        break;
      }

      case YTVideoState.Playing: {
        this.state = VideoState.Playing;
        break;
      }

      case YTVideoState.Buffering: {
        this.state = VideoState.Buffering;
        break;
      }

      default: {
        this.state = VideoState.Unknown;
        break;
      }
    }
    this.eventEmitter.emit("stateChanged", this.getState());
  }

  public updateVideoDetails(
    videoDetails: YTVideoDetails,
    playlistId: string,
    album: { id: string; text: string } | null,
    likeStatus: YTLikeStatus,
    hasFullMetadata: boolean
  ) {
    this.videoDetails = {
      author: videoDetails.author,
      channelId: videoDetails.channelId,
      title: videoDetails.title,
      album: album?.text ?? null,
      albumId: album?.id ?? null,
      likeStatus: transformLikeStatus(likeStatus),
      thumbnails: videoDetails.thumbnail ? videoDetails.thumbnail.thumbnails.map(mapYTThumbnails) : [], // There are cases where the thumbnails simply don't exist on the videoDetails but can be found via other means. Podcasts notably can do this
      durationSeconds: parseInt(videoDetails.lengthSeconds),
      id: videoDetails.videoId,
      videoType: transformVideoType(videoDetails.musicVideoType),
      isLive: !!videoDetails.isLive
    };
    this.playlistId = playlistId;
    this.hasFullMetadata = hasFullMetadata;
    this.eventEmitter.emit("stateChanged", this.getState());
  }

  public updateFromStore(
    queueState: YTPlayerQueue | null,
    likeStatus: YTLikeStatus | null,
    volume: number | null,
    muted: boolean | null,
    adPlaying: boolean | null
  ) {
    const queueItems = queueState ? queueState.items?.map(mapYTQueueItems) : [];
    const automixItems = queueState ? queueState.automixItems?.map(mapYTQueueItems) : [];
    this.queue = queueState
      ? {
          // automixItems comes from an autoplay queue that isn't pushed yet to the main queue. A radio will never have automixItems (weird YouTube distinction from autoplay vs radio)
          automixItems: automixItems,
          autoplay: queueState.autoplay,
          isGenerating: queueState.isGenerating,
          // Observed state seems to be a radio having infinite true while an autoplay queue has infinite false
          isInfinite: queueState.isInfinite,
          items: queueItems,
          repeatMode: transformRepeatMode(queueState.repeatMode),
          // YouTube has a native selectedItemIndex property but that isn't updated correctly so we calculate it ourselves
          selectedItemIndex: queueItems.findIndex(item => {
            return item.selected;
          })
        }
      : null;
    if (this.videoDetails) {
      this.videoDetails.likeStatus = transformLikeStatus(likeStatus);
    }
    this.adPlaying = adPlaying === true;
    this.muted = muted === true;
    if (typeof volume === "number" && volume >= 0) this.volume = volume;

    this.eventEmitter.emit("stateChanged", this.getState());
  }

  public addEventListener(listener: (state: PlayerState) => void) {
    this.eventEmitter.addListener("stateChanged", listener);
  }

  public removeEventListener(listener: (state: PlayerState) => void) {
    this.eventEmitter.removeListener("stateChanged", listener);
  }
}

export default new PlayerStateStore();
