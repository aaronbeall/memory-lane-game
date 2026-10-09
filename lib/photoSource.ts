import * as MediaLibrary from "expo-media-library";

export type Album = {
  id: string;
  title: string;
  assetCount: number;
};

export async function requestMediaLibraryPermission(): Promise<boolean> {
  const { status } = await MediaLibrary.requestPermissionsAsync();
  return status === "granted";
}

export async function listAlbums(): Promise<Album[]> {
  const albums = await MediaLibrary.getAlbumsAsync({ includeSmartAlbums: true });
  return albums
    .filter((a) => a.assetCount > 0)
    .map((a) => ({ id: a.id, title: a.title, assetCount: a.assetCount }))
    .sort((a, b) => b.assetCount - a.assetCount);
}

export type PhotoAsset = {
  id: string;
  uri: string;
  creationTime: number;
  width: number;
  height: number;
};

export type AssetPage = {
  assets: PhotoAsset[];
  endCursor: string | undefined;
  hasNextPage: boolean;
};

/** On iOS, MediaLibrary asset uris are ph:// references that native image-processing
 *  APIs (expo-image-manipulator, expo-file-system) generally can't read directly, even
 *  though <Image> can display them fine. Resolve a real local file uri before analyzing. */
export async function resolveAnalyzableUri(asset: PhotoAsset): Promise<string> {
  if (!asset.uri.startsWith("ph://")) return asset.uri;
  try {
    const info = await MediaLibrary.getAssetInfoAsync(asset.id);
    return info.localUri ?? asset.uri;
  } catch {
    return asset.uri;
  }
}

/** Fetches one page of photo assets, optionally scoped to a set of albums.
 *  Callers should page through with `after` rather than requesting everything at once. */
export async function fetchAssetPage(opts: {
  albumIds?: string[];
  after?: string;
  pageSize?: number;
}): Promise<AssetPage> {
  const pageSize = opts.pageSize ?? 60;

  if (opts.albumIds && opts.albumIds.length > 1) {
    // MediaLibrary only supports a single album per query; merge pages across albums.
    return fetchMultiAlbumPage(opts.albumIds, opts.after, pageSize);
  }

  const result = await MediaLibrary.getAssetsAsync({
    first: pageSize,
    after: opts.after,
    album: opts.albumIds?.[0],
    mediaType: [MediaLibrary.MediaType.photo],
    sortBy: [MediaLibrary.SortBy.creationTime],
  });

  return {
    assets: result.assets.map(toPhotoAsset),
    endCursor: result.endCursor,
    hasNextPage: result.hasNextPage,
  };
}

function toPhotoAsset(asset: MediaLibrary.Asset): PhotoAsset {
  return {
    id: asset.id,
    uri: asset.uri,
    creationTime: asset.creationTime,
    width: asset.width,
    height: asset.height,
  };
}

// Cursor format for merged multi-album paging: "<albumIndex>:<cursorWithinAlbum>"
async function fetchMultiAlbumPage(albumIds: string[], after: string | undefined, pageSize: number): Promise<AssetPage> {
  let albumIndex = 0;
  let innerCursor: string | undefined;
  if (after) {
    const [idxStr, ...rest] = after.split(":");
    albumIndex = parseInt(idxStr, 10) || 0;
    innerCursor = rest.join(":") || undefined;
  }

  while (albumIndex < albumIds.length) {
    const result = await MediaLibrary.getAssetsAsync({
      first: pageSize,
      after: innerCursor,
      album: albumIds[albumIndex],
      mediaType: [MediaLibrary.MediaType.photo],
      sortBy: [MediaLibrary.SortBy.creationTime],
    });

    if (result.assets.length > 0) {
      const hasMoreInAlbum = result.hasNextPage;
      const hasMoreAlbums = albumIndex < albumIds.length - 1;
      return {
        assets: result.assets.map(toPhotoAsset),
        endCursor: hasMoreInAlbum
          ? `${albumIndex}:${result.endCursor}`
          : hasMoreAlbums
          ? `${albumIndex + 1}:`
          : undefined,
        hasNextPage: hasMoreInAlbum || hasMoreAlbums,
      };
    }

    // Empty page from this album; move to the next one.
    albumIndex++;
    innerCursor = undefined;
  }

  return { assets: [], endCursor: undefined, hasNextPage: false };
}
