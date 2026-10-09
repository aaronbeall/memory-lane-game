import { Difficulty } from "./db";

export type PendingGame = {
  difficulty: Difficulty;
  photos: { hash: string; uri: string }[];
  sourceDescription: string;
};

let pending: PendingGame | null = null;

export function setPendingGame(game: PendingGame) {
  pending = game;
}

export function takePendingGame(): PendingGame | null {
  const g = pending;
  pending = null;
  return g;
}
