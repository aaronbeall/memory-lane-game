import { analyzeImage, hammingDistance, isInteresting } from "./imageScoring";
import { fetchAssetPage, PhotoAsset, resolveAnalyzableUri } from "./photoSource";
import { getAllExcludedHashes, getHeartedPhotos, getHistoryByHashes, touchPhotoSeen } from "./db";
import { shuffle } from "./gameEngine";

export type RecencyPreference = "surprise" | "balanced" | "familiar";

export type SmartPickOptions = {
  albumIds?: string[]; // omit for "all photos"
  count: number; // number of unique photos needed
  preference: RecencyPreference;
  pageSize?: number;
  maxScanned?: number; // safety cap so huge libraries don't scan forever
  similarityThreshold?: number; // Hamming distance below which two photos are "duplicates"
};

export type PickedPhoto = {
  hash: string;
  uri: string;
  assetId: string;
  interestScore: number;
};

type Candidate = PickedPhoto & { lastUsedAt: number | null; timesUsed: number };

/** Streams through the photo library page by page, scoring and de-duping as it goes,
 *  and stops as soon as it has enough good candidates. Never holds more than one
 *  page of decoded thumbnails in memory at a time. */
export async function smartPick(opts: SmartPickOptions): Promise<PickedPhoto[]> {
  const pageSize = opts.pageSize ?? 40;
  const maxScanned = opts.maxScanned ?? 600;
  const similarityThreshold = opts.similarityThreshold ?? 6;

  const excluded = await getAllExcludedHashes();
  const accepted: Candidate[] = [];
  const acceptedHashes: string[] = [];

  let after: string | undefined;
  let scanned = 0;
  let hasNextPage = true;

  // Gather more candidates than needed so recency preference has something to sort over.
  const targetPoolSize = Math.max(opts.count * 3, opts.count + 10);

  while (hasNextPage && scanned < maxScanned && accepted.length < targetPoolSize) {
    const page = await fetchAssetPage({ albumIds: opts.albumIds, after, pageSize });
    hasNextPage = page.hasNextPage;
    after = page.endCursor;
    scanned += page.assets.length;
    if (page.assets.length === 0) break;

    for (const asset of page.assets) {
      if (accepted.length >= targetPoolSize) break;
      let analysis;
      try {
        analysis = await analyzeImage(await resolveAnalyzableUri(asset));
      } catch {
        continue; // undecodable image, skip it
      }
      if (!isInteresting(analysis)) continue;
      if (excluded.has(analysis.hash)) continue;
      // Checked (and updated) per-image so two near-duplicates in the same page can't both slip through.
      if (acceptedHashes.some((h) => hammingDistance(h, analysis!.hash) < similarityThreshold)) continue;

      accepted.push({ hash: analysis.hash, uri: asset.uri, assetId: asset.id, interestScore: analysis.interestScore, lastUsedAt: null, timesUsed: 0 });
      acceptedHashes.push(analysis.hash);
    }
  }

  // Enrich with play history for recency weighting.
  const history = await getHistoryByHashes(accepted.map((c) => c.hash));
  for (const c of accepted) {
    const h = history.get(c.hash);
    if (h) {
      c.lastUsedAt = h.lastUsedAt;
      c.timesUsed = h.timesUsed;
    }
  }

  const ordered = orderByPreference(accepted, opts.preference);
  const chosen = ordered.slice(0, opts.count);

  await Promise.all(chosen.map((c) => touchPhotoSeen(c.hash, c.uri, c.assetId)));

  return chosen.map((c) => ({ hash: c.hash, uri: c.uri, assetId: c.assetId, interestScore: c.interestScore }));
}

function orderByPreference(candidates: Candidate[], preference: RecencyPreference): Candidate[] {
  const now = Date.now();
  const DAY = 86_400_000;

  const withKeys = candidates.map((c) => {
    const neverUsed = c.lastUsedAt === null;
    const daysSinceUsed = neverUsed ? Infinity : (now - c.lastUsedAt!) / DAY;
    return { c, neverUsed, daysSinceUsed };
  });

  if (preference === "surprise") {
    // Photos never played before come first; among ones seen before, longest-ago-seen first.
    withKeys.sort((a, b) => {
      if (a.neverUsed !== b.neverUsed) return a.neverUsed ? -1 : 1;
      return b.daysSinceUsed - a.daysSinceUsed;
    });
  } else if (preference === "familiar") {
    // Photos with history come first, most-replayed ones first, ties broken by longest-ago-seen.
    withKeys.sort((a, b) => {
      if (a.neverUsed !== b.neverUsed) return a.neverUsed ? 1 : -1;
      if (a.c.timesUsed !== b.c.timesUsed) return b.c.timesUsed - a.c.timesUsed;
      return b.daysSinceUsed - a.daysSinceUsed;
    });
  } else {
    // Balanced: mostly interest score, with a modest bonus for photos that are new or stale
    // so the same top-scoring shots don't dominate every game.
    withKeys.sort((a, b) => {
      const scoreA = a.c.interestScore + Math.min(a.daysSinceUsed, 30) * 0.5;
      const scoreB = b.c.interestScore + Math.min(b.daysSinceUsed, 30) * 0.5;
      return scoreB - scoreA;
    });
  }

  return withKeys.map((w) => w.c);
}

/** Fast path that skips scoring: just samples random distinct photos, respecting exclusions. */
export async function randomPick(opts: { albumIds?: string[]; count: number; pageSize?: number; maxScanned?: number }): Promise<PickedPhoto[]> {
  const pageSize = opts.pageSize ?? 60;
  const maxScanned = opts.maxScanned ?? 400;
  const excluded = await getAllExcludedHashes();

  const pool: PhotoAsset[] = [];
  let after: string | undefined;
  let scanned = 0;
  let hasNextPage = true;

  while (hasNextPage && scanned < maxScanned && pool.length < opts.count * 4) {
    const page = await fetchAssetPage({ albumIds: opts.albumIds, after, pageSize });
    hasNextPage = page.hasNextPage;
    after = page.endCursor;
    scanned += page.assets.length;
    if (page.assets.length === 0) break;
    pool.push(...page.assets);
  }

  const shuffled = shuffle(pool);
  const chosen: PickedPhoto[] = [];
  for (const asset of shuffled) {
    if (chosen.length >= opts.count) break;
    try {
      const analysis = await analyzeImage(await resolveAnalyzableUri(asset));
      if (excluded.has(analysis.hash)) continue;
      if (chosen.some((c) => hammingDistance(c.hash, analysis.hash) < 6)) continue;
      chosen.push({ hash: analysis.hash, uri: asset.uri, assetId: asset.id, interestScore: analysis.interestScore });
    } catch {
      // skip undecodable image
    }
  }

  await Promise.all(chosen.map((c) => touchPhotoSeen(c.hash, c.uri, c.assetId)));
  return chosen;
}

/** Builds a game entirely from hearted photos. */
export async function pickFavorites(count: number): Promise<PickedPhoto[]> {
  const hearted = await getHeartedPhotos();
  const shuffled = shuffle(hearted).slice(0, count);
  const chosen = shuffled.map((h) => ({ hash: h.hash, uri: h.uri, assetId: h.assetId ?? "", interestScore: 0 }));
  await Promise.all(chosen.map((c) => touchPhotoSeen(c.hash, c.uri, c.assetId || null)));
  return chosen;
}

/** Hashes manually-picked images (from the system picker) so they participate in history/heart/exclude. */
export async function hashManualPicks(uris: string[]): Promise<PickedPhoto[]> {
  const results: PickedPhoto[] = [];
  for (const uri of uris) {
    try {
      const analysis = await analyzeImage(uri);
      results.push({ hash: analysis.hash, uri, assetId: "", interestScore: analysis.interestScore });
    } catch {
      // If it fails to decode, still let it through with a uri-derived pseudo-hash so it's playable.
      results.push({ hash: `uri:${uri}`, uri, assetId: "", interestScore: 0 });
    }
  }
  await Promise.all(results.map((c) => touchPhotoSeen(c.hash, c.uri, null)));
  return results;
}
