import * as SQLite from "expo-sqlite";

export type Difficulty = "small" | "medium" | "large" | "xl";

export const DIFFICULTIES: Record<Difficulty, { label: string; pairs: number; columns: number }> = {
  small: { label: "Small", pairs: 6, columns: 3 },
  medium: { label: "Medium", pairs: 8, columns: 4 },
  large: { label: "Large", pairs: 10, columns: 4 },
  xl: { label: "XL", pairs: 15, columns: 5 },
};

export type PhotoHistoryRow = {
  hash: string;
  assetId: string | null;
  uri: string;
  lastUsedAt: number | null;
  timesUsed: number;
  hearted: number;
  excluded: number;
  firstSeenAt: number;
};

export type SavedGamePhoto = { hash: string; uri: string };

export type SavedGameState = {
  slot: "current" | "previous";
  difficulty: Difficulty;
  photos: SavedGamePhoto[];
  tileOrder: number[]; // index into photos, length = pairs*2
  matchedTileIds: number[];
  flips: number;
  matches: number;
  bestCombo: number;
  currentCombo: number;
  elapsedSeconds: number;
  sourceDescription: string;
  updatedAt: number;
};

export type GameResult = {
  difficulty: Difficulty;
  flips: number;
  matches: number;
  bestCombo: number;
  elapsedSeconds: number;
  won: boolean;
  completedAt: number;
};

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

function getDb() {
  if (!dbPromise) {
    dbPromise = SQLite.openDatabaseAsync("memory-lane.db");
  }
  return dbPromise;
}

export async function initDb() {
  const db = await getDb();
  await db.execAsync(`
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS photo_history (
      hash TEXT PRIMARY KEY NOT NULL,
      assetId TEXT,
      uri TEXT NOT NULL,
      lastUsedAt INTEGER,
      timesUsed INTEGER NOT NULL DEFAULT 0,
      hearted INTEGER NOT NULL DEFAULT 0,
      excluded INTEGER NOT NULL DEFAULT 0,
      firstSeenAt INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS saved_game (
      slot TEXT PRIMARY KEY NOT NULL,
      data TEXT NOT NULL,
      updatedAt INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS games (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      difficulty TEXT NOT NULL,
      flips INTEGER NOT NULL,
      matches INTEGER NOT NULL,
      bestCombo INTEGER NOT NULL,
      elapsedSeconds INTEGER NOT NULL,
      won INTEGER NOT NULL,
      completedAt INTEGER NOT NULL
    );
  `);
  return db;
}

// ---- photo_history ----

export async function getHistoryByHashes(hashes: string[]): Promise<Map<string, PhotoHistoryRow>> {
  if (hashes.length === 0) return new Map();
  const db = await getDb();
  const placeholders = hashes.map(() => "?").join(",");
  const rows = await db.getAllAsync<PhotoHistoryRow>(
    `SELECT * FROM photo_history WHERE hash IN (${placeholders})`,
    hashes
  );
  return new Map(rows.map((r) => [r.hash, r]));
}

export async function getAllExcludedHashes(): Promise<Set<string>> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ hash: string }>(
    `SELECT hash FROM photo_history WHERE excluded = 1`
  );
  return new Set(rows.map((r) => r.hash));
}

export async function getHeartedPhotos(): Promise<PhotoHistoryRow[]> {
  const db = await getDb();
  return db.getAllAsync<PhotoHistoryRow>(
    `SELECT * FROM photo_history WHERE hearted = 1 AND excluded = 0 ORDER BY lastUsedAt DESC`
  );
}

export async function getExcludedPhotos(): Promise<PhotoHistoryRow[]> {
  const db = await getDb();
  return db.getAllAsync<PhotoHistoryRow>(
    `SELECT * FROM photo_history WHERE excluded = 1 ORDER BY firstSeenAt DESC`
  );
}

export async function touchPhotoSeen(hash: string, uri: string, assetId: string | null) {
  const db = await getDb();
  const now = Date.now();
  await db.runAsync(
    `INSERT INTO photo_history (hash, assetId, uri, lastUsedAt, timesUsed, hearted, excluded, firstSeenAt)
     VALUES (?, ?, ?, NULL, 0, 0, 0, ?)
     ON CONFLICT(hash) DO UPDATE SET uri = excluded.uri, assetId = COALESCE(excluded.assetId, photo_history.assetId)`,
    [hash, assetId, uri, now]
  );
}

export async function markPhotosUsed(hashes: string[]) {
  if (hashes.length === 0) return;
  const db = await getDb();
  const now = Date.now();
  await db.execAsync("BEGIN TRANSACTION");
  try {
    for (const hash of hashes) {
      await db.runAsync(
        `UPDATE photo_history SET lastUsedAt = ?, timesUsed = timesUsed + 1 WHERE hash = ?`,
        [now, hash]
      );
    }
    await db.execAsync("COMMIT");
  } catch (e) {
    await db.execAsync("ROLLBACK");
    throw e;
  }
}

export async function setHearted(hash: string, hearted: boolean) {
  const db = await getDb();
  await db.runAsync(`UPDATE photo_history SET hearted = ? WHERE hash = ?`, [hearted ? 1 : 0, hash]);
}

export async function setExcluded(hash: string, excluded: boolean) {
  const db = await getDb();
  await db.runAsync(`UPDATE photo_history SET excluded = ? WHERE hash = ?`, [excluded ? 1 : 0, hash]);
}

// ---- saved_game ----

export async function saveGameState(state: SavedGameState) {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO saved_game (slot, data, updatedAt) VALUES (?, ?, ?)
     ON CONFLICT(slot) DO UPDATE SET data = excluded.data, updatedAt = excluded.updatedAt`,
    [state.slot, JSON.stringify(state), state.updatedAt]
  );
}

export async function loadGameState(slot: "current" | "previous"): Promise<SavedGameState | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ data: string }>(
    `SELECT data FROM saved_game WHERE slot = ?`,
    [slot]
  );
  if (!row) return null;
  try {
    return JSON.parse(row.data) as SavedGameState;
  } catch {
    return null;
  }
}

export async function clearGameState(slot: "current" | "previous") {
  const db = await getDb();
  await db.runAsync(`DELETE FROM saved_game WHERE slot = ?`, [slot]);
}

// ---- games / stats ----

export async function recordGameResult(result: GameResult) {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO games (difficulty, flips, matches, bestCombo, elapsedSeconds, won, completedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [result.difficulty, result.flips, result.matches, result.bestCombo, result.elapsedSeconds, result.won ? 1 : 0, result.completedAt]
  );
}

export type OverallStats = {
  gamesPlayed: number;
  gamesWon: number;
  totalFlips: number;
  totalMatches: number;
  bestCombo: number;
  currentWinStreak: number;
  bestWinStreak: number;
  bestTimeByDifficulty: Partial<Record<Difficulty, number>>;
  bestFlipsByDifficulty: Partial<Record<Difficulty, number>>;
};

export async function getOverallStats(): Promise<OverallStats> {
  const db = await getDb();
  const games = await db.getAllAsync<{
    difficulty: Difficulty;
    flips: number;
    matches: number;
    bestCombo: number;
    elapsedSeconds: number;
    won: number;
    completedAt: number;
  }>(`SELECT difficulty, flips, matches, bestCombo, elapsedSeconds, won, completedAt FROM games ORDER BY completedAt ASC`);

  const stats: OverallStats = {
    gamesPlayed: games.length,
    gamesWon: 0,
    totalFlips: 0,
    totalMatches: 0,
    bestCombo: 0,
    currentWinStreak: 0,
    bestWinStreak: 0,
    bestTimeByDifficulty: {},
    bestFlipsByDifficulty: {},
  };

  let runningStreak = 0;
  for (const g of games) {
    stats.totalFlips += g.flips;
    stats.totalMatches += g.matches;
    stats.bestCombo = Math.max(stats.bestCombo, g.bestCombo);
    if (g.won) {
      stats.gamesWon++;
      runningStreak++;
      stats.bestWinStreak = Math.max(stats.bestWinStreak, runningStreak);

      const bestTime = stats.bestTimeByDifficulty[g.difficulty];
      if (bestTime === undefined || g.elapsedSeconds < bestTime) {
        stats.bestTimeByDifficulty[g.difficulty] = g.elapsedSeconds;
      }
      const bestFlips = stats.bestFlipsByDifficulty[g.difficulty];
      if (bestFlips === undefined || g.flips < bestFlips) {
        stats.bestFlipsByDifficulty[g.difficulty] = g.flips;
      }
    } else {
      runningStreak = 0;
    }
  }
  stats.currentWinStreak = runningStreak;

  return stats;
}
