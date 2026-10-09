import { Animated } from "react-native";
import { Difficulty, DIFFICULTIES } from "./db";

export function shuffle<T>(array: T[]): T[] {
  const copy = [...array];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export type Tile = {
  id: number;
  photoIndex: number; // index into the game's photo list; two tiles share a photoIndex when they're a pair
  hash: string;
  img: string;
  matched: boolean;
  flipped: boolean;
  animation: Animated.Value;
};

export type GamePhoto = { hash: string; uri: string };

export function buildTiles(photos: GamePhoto[]): Tile[] {
  const pairs = photos.flatMap((photo, photoIndex) => [
    { photo, photoIndex },
    { photo, photoIndex },
  ]);
  const shuffled = shuffle(pairs);
  return shuffled.map((p, id) => ({
    id,
    photoIndex: p.photoIndex,
    hash: p.photo.hash,
    img: p.photo.uri,
    matched: false,
    flipped: false,
    animation: new Animated.Value(0),
  }));
}

export function minPhotosFor(difficulty: Difficulty): number {
  return DIFFICULTIES[difficulty].pairs;
}

export type GameState = {
  tiles: Tile[];
  flippedTiles: number[];
  flips: number;
  matches: number;
  currentCombo: number;
  bestCombo: number;
};

export function initialGameState(tiles: Tile[]): GameState {
  return { tiles, flippedTiles: [], flips: 0, matches: 0, currentCombo: 0, bestCombo: 0 };
}

export function isGameWon(state: GameState): boolean {
  return state.tiles.length > 0 && state.tiles.every((t) => t.matched);
}

export type MatchOutcome = {
  state: GameState;
  matched: boolean;
  matchedImg: string | null;
};

/** Resolves the two currently-flipped tiles: marks them matched or flips them back,
 *  and updates flip/match/combo counters. */
export function resolveMatch(state: GameState): MatchOutcome {
  const [firstId, secondId] = state.flippedTiles;
  const tiles = state.tiles.map((t) => ({ ...t }));
  const first = tiles.find((t) => t.id === firstId)!;
  const second = tiles.find((t) => t.id === secondId)!;

  const isMatch = first.photoIndex === second.photoIndex;

  if (isMatch) {
    first.matched = true;
    second.matched = true;
  } else {
    first.flipped = false;
    second.flipped = false;
  }

  const currentCombo = isMatch ? state.currentCombo + 1 : 0;
  const bestCombo = Math.max(state.bestCombo, currentCombo);

  return {
    state: {
      tiles,
      flippedTiles: [],
      flips: state.flips + 1,
      matches: state.matches + (isMatch ? 1 : 0),
      currentCombo,
      bestCombo,
    },
    matched: isMatch,
    matchedImg: isMatch ? first.img : null,
  };
}
