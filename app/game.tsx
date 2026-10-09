import React, { useEffect, useState } from "react";
import { View, Text, TouchableOpacity, Image, FlatList, StyleSheet, Animated, Easing, Share } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { getRandomScheme, ColorScheme } from "@/lib/theme";
import { shared } from "@/lib/styles";
import {
  Tile,
  GamePhoto,
  buildTiles,
  initialGameState,
  resolveMatch,
  isGameWon,
  GameState,
} from "@/lib/gameEngine";
import { Difficulty, DIFFICULTIES, SavedGameState, saveGameState, loadGameState, clearGameState, recordGameResult, markPhotosUsed, setHearted, setExcluded, getHistoryByHashes } from "@/lib/db";
import { takePendingGame } from "@/lib/pendingGame";

export default function GameScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ resume?: string }>();
  const [colors] = useState<ColorScheme>(getRandomScheme());

  const [loading, setLoading] = useState(true);
  const [difficulty, setDifficulty] = useState<Difficulty>("medium");
  const [photos, setPhotos] = useState<GamePhoto[]>([]);
  const [sourceDescription, setSourceDescription] = useState("");
  const [gameState, setGameState] = useState<GameState>(initialGameState([]));

  const [timeElapsed, setTimeElapsed] = useState(0);
  const [fullScreenTile, setFullScreenTile] = useState<Tile | null>(null);
  const [heartedHashes, setHeartedHashes] = useState<Set<string>>(new Set());
  const [comboToast, setComboToast] = useState<number | null>(null);

  const [cardScaleAnimation] = useState(new Animated.Value(1));
  const [congratulationsVisible, setCongratulationsVisible] = useState(false);
  const [congratulationsAnimation] = useState(new Animated.Value(0));
  const [popperAnimation] = useState(new Animated.Value(0));

  const paused = fullScreenTile !== null || congratulationsVisible;

  // ---- load: either a freshly-picked game, a resumed "current" game, or a "previous" game for replay ----
  useEffect(() => {
    (async () => {
      if (params.resume === "current") {
        const saved = await loadGameState("current");
        if (saved) {
          setDifficulty(saved.difficulty);
          setPhotos(saved.photos);
          setSourceDescription(saved.sourceDescription);
          const tiles = rebuildTiles(saved);
          setGameState({
            tiles,
            flippedTiles: [],
            flips: saved.flips,
            matches: saved.matches,
            currentCombo: saved.currentCombo,
            bestCombo: saved.bestCombo,
          });
          setTimeElapsed(saved.elapsedSeconds);
          seedHearted(saved.photos);
          setLoading(false);
          return;
        }
      } else if (params.resume === "previous") {
        const saved = await loadGameState("previous");
        if (saved) {
          startFresh(saved.photos, saved.difficulty, saved.sourceDescription);
          return;
        }
      }

      const pending = takePendingGame();
      if (pending) {
        startFresh(pending.photos, pending.difficulty, pending.sourceDescription);
      } else {
        router.replace("/setup");
      }
    })();
  }, []);

  const startFresh = (gamePhotos: GamePhoto[], diff: Difficulty, desc: string) => {
    setDifficulty(diff);
    setPhotos(gamePhotos);
    setSourceDescription(desc);
    setGameState(initialGameState(buildTiles(gamePhotos)));
    setTimeElapsed(0);
    seedHearted(gamePhotos);
    setLoading(false);
  };

  const seedHearted = (gamePhotos: GamePhoto[]) => {
    getHistoryByHashes(gamePhotos.map((p) => p.hash)).then((history) => {
      const hearted = new Set<string>();
      history.forEach((row, hash) => {
        if (row.hearted) hearted.add(hash);
      });
      setHeartedHashes(hearted);
    });
  };

  // ---- timer ----
  useEffect(() => {
    if (loading) return;
    const timer = setInterval(() => {
      if (!paused) setTimeElapsed((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [loading, paused]);

  // ---- autosave in-progress game ----
  useEffect(() => {
    if (loading || congratulationsVisible) return;
    const tileOrder = gameState.tiles.map((t) => t.photoIndex);
    const matchedTileIds = gameState.tiles.filter((t) => t.matched).map((t) => t.id);
    saveGameState({
      slot: "current",
      difficulty,
      photos,
      tileOrder,
      matchedTileIds,
      flips: gameState.flips,
      matches: gameState.matches,
      bestCombo: gameState.bestCombo,
      currentCombo: gameState.currentCombo,
      elapsedSeconds: timeElapsed,
      sourceDescription,
      updatedAt: Date.now(),
    });
  }, [gameState, loading]);

  // ---- win handling ----
  useEffect(() => {
    if (loading || fullScreenTile) return;
    if (isGameWon(gameState)) {
      setCongratulationsVisible(true);
      Animated.spring(congratulationsAnimation, { toValue: 1, friction: 5, tension: 100, useNativeDriver: true }).start();
      Animated.sequence([
        Animated.delay(500),
        Animated.spring(popperAnimation, { toValue: 1, friction: 3, tension: 100, useNativeDriver: true }),
      ]).start();

      recordGameResult({
        difficulty,
        flips: gameState.flips,
        matches: gameState.matches,
        bestCombo: gameState.bestCombo,
        elapsedSeconds: timeElapsed,
        won: true,
        completedAt: Date.now(),
      });
      clearGameState("current");
      saveGameState({
        slot: "previous",
        difficulty,
        photos,
        tileOrder: [],
        matchedTileIds: [],
        flips: 0,
        matches: 0,
        bestCombo: 0,
        currentCombo: 0,
        elapsedSeconds: 0,
        sourceDescription,
        updatedAt: Date.now(),
      });
    }
  }, [gameState.tiles, fullScreenTile, loading]);

  const flipTile = (tileId: number) => {
    if (gameState.flippedTiles.length === 2) return;
    const target = gameState.tiles.find((t) => t.id === tileId);
    if (!target || target.flipped || target.matched) return;

    const tiles = gameState.tiles.map((t) => (t.id === tileId ? { ...t, flipped: true } : t));
    const flippedTiles = [...gameState.flippedTiles, tileId];

    Animated.timing(target.animation, { toValue: 1, duration: 300, useNativeDriver: true }).start();

    setGameState({ ...gameState, tiles, flippedTiles });

    if (flippedTiles.length === 2) {
      setTimeout(() => checkMatch(flippedTiles), 800);
    }
  };

  const checkMatch = (flippedTiles: number[]) => {
    setGameState((prevState) => {
      const outcome = resolveMatch({ ...prevState, flippedTiles });

      if (outcome.matched) {
        const matchedTile = outcome.state.tiles.find((t) => t.matched && flippedTiles.includes(t.id))!;
        setFullScreenTile(matchedTile);
        markPhotosUsed(outcome.state.tiles.filter((t) => flippedTiles.includes(t.id)).map((t) => t.hash));
        Animated.spring(cardScaleAnimation, { toValue: 1.2, friction: 3, tension: 100, useNativeDriver: true }).start();

        if (outcome.state.currentCombo >= 2) {
          setComboToast(outcome.state.currentCombo);
          setTimeout(() => setComboToast(null), 1200);
        }
      } else {
        const [firstId, secondId] = flippedTiles;
        const first = prevState.tiles.find((t) => t.id === firstId);
        const second = prevState.tiles.find((t) => t.id === secondId);
        if (first) Animated.timing(first.animation, { toValue: 0, duration: 300, useNativeDriver: true }).start();
        if (second) Animated.timing(second.animation, { toValue: 0, duration: 300, useNativeDriver: true }).start();
      }

      return outcome.state;
    });
  };

  const handleTapFullScreenImage = () => {
    Animated.timing(cardScaleAnimation, { toValue: 0, easing: Easing.out(Easing.cubic), duration: 150, useNativeDriver: true }).start(() => {
      setFullScreenTile(null);
    });
  };

  const toggleHeart = async (tile: Tile) => {
    const nowHearted = !heartedHashes.has(tile.hash);
    setHeartedHashes((prev) => {
      const next = new Set(prev);
      if (nowHearted) next.add(tile.hash);
      else next.delete(tile.hash);
      return next;
    });
    await setHearted(tile.hash, nowHearted);
  };

  const excludePhoto = async (tile: Tile) => {
    await setExcluded(tile.hash, true);
    setFullScreenTile(null);
  };

  const shareResult = async () => {
    // iOS Photos-library uris (ph://) aren't reliably shareable as an attachment, so only
    // attach the image when it's a plain file/content uri; the text always goes through.
    const img = fullScreenTile?.img ?? photos[0]?.uri;
    const canAttachImage = !!img && !img.startsWith("ph://");
    try {
      await Share.share({
        message: `I matched ${gameState.matches} pairs of my own photos in ${timeElapsed}s on Memory Lane! 🖼️`,
        ...(canAttachImage ? { url: img } : {}),
      });
    } catch {
      // user cancelled or share unsupported; ignore
    }
  };

  const playAgain = () => {
    setCongratulationsVisible(false);
    congratulationsAnimation.setValue(0);
    popperAnimation.setValue(0);
    startFresh(photos, difficulty, sourceDescription);
  };

  if (loading) {
    return <View style={[shared.centered, { backgroundColor: colors.background }]} />;
  }

  const columns = DIFFICULTIES[difficulty].columns;

  return (
    <View style={[shared.container, { backgroundColor: colors.background }]}>
      <TouchableOpacity onPress={() => router.replace("/")} style={shared.backButton}>
        <Ionicons name="arrow-back" size={24} color={colors.text} />
      </TouchableOpacity>

      <View style={styles.header}>
        <Text style={{ color: colors.text }}>Matches: {gameState.matches}/{photos.length}</Text>
        <Text style={{ color: colors.secondaryText }}>Flips: {gameState.flips}</Text>
        <Text style={{ color: colors.secondaryText }}>{timeElapsed}s</Text>
      </View>

      {comboToast !== null && (
        <View style={[styles.comboToast, { backgroundColor: colors.primary }]}>
          <Text style={{ color: colors.text, fontWeight: "700" }}>🔥 Combo x{comboToast}!</Text>
        </View>
      )}

      <FlatList
        key={columns}
        data={gameState.tiles}
        numColumns={columns}
        contentContainerStyle={{ paddingTop: 10 }}
        renderItem={({ item }) => {
          const flipInterpolate = item.animation.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "180deg"] });
          return (
            <TouchableOpacity onPress={() => flipTile(item.id)} disabled={item.matched || item.flipped}>
              <Animated.View
                style={[
                  styles.tile,
                  { transform: [{ rotateY: flipInterpolate }], backgroundColor: item.flipped || item.matched ? colors.primary : colors.accent },
                ]}
              >
                {item.flipped || item.matched ? <Image source={{ uri: item.img }} style={styles.image} /> : null}
              </Animated.View>
            </TouchableOpacity>
          );
        }}
      />

      {fullScreenTile && (
        <View style={styles.fullScreenImageContainer}>
          <TouchableOpacity onPress={handleTapFullScreenImage} style={StyleSheet.absoluteFill} activeOpacity={1} />
          <Animated.Image source={{ uri: fullScreenTile.img }} style={[styles.fullScreenImage, { transform: [{ scale: cardScaleAnimation }] }]} />
          <View style={styles.fullScreenActions}>
            <TouchableOpacity onPress={() => toggleHeart(fullScreenTile)} style={styles.iconButton}>
              <Ionicons name={heartedHashes.has(fullScreenTile.hash) ? "heart" : "heart-outline"} size={28} color="#FFF" />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => excludePhoto(fullScreenTile)} style={styles.iconButton}>
              <Ionicons name="eye-off-outline" size={26} color="#FFF" />
            </TouchableOpacity>
          </View>
        </View>
      )}

      {congratulationsVisible && (
        <Animated.View style={[styles.congratulationsCard, { transform: [{ scale: congratulationsAnimation }] }]}>
          <Text style={styles.congratulationsText}>Great Job!</Text>
          <Animated.View style={[styles.partyPopper, { transform: [{ scale: popperAnimation }] }]}>
            <Text style={{ fontSize: 60 }}>🎉</Text>
          </Animated.View>
          <Text>Matches: {gameState.matches} · Flips: {gameState.flips}</Text>
          <Text>Time: {timeElapsed}s{gameState.bestCombo >= 2 ? ` · Best Combo x${gameState.bestCombo}` : ""}</Text>
          <View style={[shared.buttonContainer, { marginTop: 20 }]}>
            <TouchableOpacity onPress={playAgain} style={[shared.primaryButton, { backgroundColor: colors.primary }]}>
              <Text style={{ color: colors.text }}>Play Again</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => router.replace("/setup")} style={[shared.primaryButton, { backgroundColor: colors.primary }]}>
              <Text style={{ color: colors.text }}>New Game</Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity onPress={shareResult} style={shared.button}>
            <Text style={{ color: "#555" }}>Share</Text>
          </TouchableOpacity>
        </Animated.View>
      )}
    </View>
  );
}

function rebuildTiles(saved: SavedGameState): Tile[] {
  return saved.tileOrder.map((photoIndex, id) => {
    const photo = saved.photos[photoIndex];
    const matched = saved.matchedTileIds.includes(id);
    return {
      id,
      photoIndex,
      hash: photo.hash,
      img: photo.uri,
      matched,
      flipped: matched,
      animation: new Animated.Value(matched ? 1 : 0),
    };
  });
}

const styles = StyleSheet.create({
  header: { alignItems: "center", marginTop: 70, gap: 2 },
  tile: { width: 75, height: 75, margin: 5, justifyContent: "center", alignItems: "center", borderRadius: 10, backfaceVisibility: "visible" },
  image: { width: 75, height: 75, borderRadius: 10 },
  comboToast: { position: "absolute", top: 60, alignSelf: "center", paddingVertical: 6, paddingHorizontal: 16, borderRadius: 16, zIndex: 15 },
  fullScreenImageContainer: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.7)",
  },
  fullScreenImage: { width: 300, height: 300, borderRadius: 10 },
  fullScreenActions: { flexDirection: "row", gap: 30, marginTop: 24 },
  iconButton: { padding: 10 },
  congratulationsCard: {
    position: "absolute",
    top: "28%",
    left: "10%",
    right: "10%",
    padding: 20,
    backgroundColor: "#FFF",
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
    elevation: 5,
    zIndex: 10,
    gap: 4,
  },
  congratulationsText: { fontSize: 24, marginBottom: 6, fontWeight: "bold" },
  partyPopper: { marginTop: 10, marginBottom: 6 },
});
