import React, { useState, useEffect } from "react";
import { View, Text, TouchableOpacity, Image, FlatList, Alert, StyleSheet, Animated, ScrollView, Easing } from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as MediaLibrary from "expo-media-library";
import { Ionicons } from "@expo/vector-icons";

export default function Index() {
  return (
    <MatchingGame />
  );
}

const lightSchemes = [
  {
    background: "#F0E5D8",
    text: "#3E3E3E",
    secondaryText: "#A1A1A1",  // Added secondary text color
    primary: "#F1A7B5",
    secondary: "#A7B8B5",
    accent: "#F9D4C1",
  },
  {
    background: "#E7ECEF",
    text: "#2D3A3F",
    secondaryText: "#8A8D8F",  // Added secondary text color
    primary: "#A4C6E1",
    secondary: "#FFB6B9",
    accent: "#B8E0D2",
  },
  {
    background: "#F9F5F0",
    text: "#4A4A4A",
    secondaryText: "#B0B0B0",  // Added secondary text color
    primary: "#B5A5D6",
    secondary: "#F3C6A0",
    accent: "#F2D3C4",
  },
];

const darkSchemes = [
  {
    background: "#4B4A58",
    text: "#E3E4E8",
    secondaryText: "#A1A1A1",  // Added secondary text color
    primary: "#6F6B7F",
    secondary: "#D19AAB",
    accent: "#7C6F7D",
  },
  {
    background: "#2C3A47",
    text: "#F6F5F5",
    secondaryText: "#A8A8A8",  // Added secondary text color
    primary: "#8F7D9B",
    secondary: "#F1A7B5",
    accent: "#2E3548",
  },
  {
    background: "#1F2A44",
    text: "#D5D7E1",
    secondaryText: "#7C7C7C",  // Added secondary text color
    primary: "#E5A1C1",
    secondary: "#5B5F75",
    accent: "#D9AAB5",
  },
];

const getRandomScheme = () => {
  const allSchemes = [...lightSchemes, ...darkSchemes];
  const randomIndex = Math.floor(Math.random() * allSchemes.length);
  return allSchemes[randomIndex];
};

const shuffle = <T extends any[]>(array: T) => array.sort(() => Math.random() - 0.5);

type Tile = {
  id: number;
  img: string;
  matched: boolean;
  flipped: boolean;
  animation: Animated.Value;
};

type GameState = {
  tiles: Tile[];
  flippedTiles: number[];
  score: number;
  flippedPairs: number;
};

const MatchingGame = () => {
  const [screen, setScreen] = useState("title");
  const [images, setImages] = useState<string[]>([]);
  const [gameState, setGameState] = useState<GameState>({
    tiles: [],
    flippedTiles: [],
    score: 0,
    flippedPairs: 0,
  });
  const [colors, setColors] = useState(getRandomScheme());
  const [timeElapsed, setTimeElapsed] = useState(0);
  const [fullScreenImage, setFullScreenImage] = useState<string | null>(null);  // Track matched image
  const [scale] = useState(new Animated.Value(1));  // For bounce effect

  useEffect(() => {
    setColors(getRandomScheme());
  }, [screen]);

  useEffect(() => {
    if (screen === "game") {
      const timer = setInterval(() => setTimeElapsed((prev) => prev + 1), 1000);
      return () => clearInterval(timer); // Cleanup on component unmount or game reset
    }
  }, [screen]);

  const startNewGame = () => {
    setScreen("setup");
  };

  const pickImage = async () => {
    let result = await ImagePicker.launchImageLibraryAsync({ allowsMultipleSelection: true });
    if (!result.canceled) {
      setImages([...images, ...result.assets.map((asset) => asset.uri)]);
    }
  };

  const pickAlbum = async () => {
    const { status } = await MediaLibrary.requestPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission Required", "You need to grant media library permissions to use this feature.");
      return;
    }

    const albums = await MediaLibrary.getAlbumsAsync();
    if (albums.length === 0) {
      Alert.alert("No Albums Found", "You don't seem to have any albums in your media library.");
      return;
    }

    const album = albums[0]; // Select the first album for now (later, you could allow users to pick one)
    const assets = await MediaLibrary.getAssetsAsync({ album: album.id, first: 50 });
    if (assets.assets.length < 6) {
      Alert.alert("Not Enough Images", "Selected album has less than 6 images.");
      return;
    }

    const shuffledImages = shuffle(assets.assets).map(asset => asset.uri);
    setImages(shuffledImages);
  };

  const startGame = () => {
    if (images.length < 6) {
      Alert.alert("Not Enough Images", "You need at least 6 images.");
      return;
    }
    let shuffledTiles = shuffle([...images, ...images]);
    setGameState({
      tiles: shuffledTiles.map((img, idx) => ({ id: idx, img, matched: false, flipped: false, animation: new Animated.Value(0) })),
      flippedTiles: [],
      score: 0,
      flippedPairs: 0
    });
    setScreen("game");
    setTimeElapsed(0); // Reset time when starting a new game
  };

  const clearImages = () => {
    setImages([]);
  };

  const flipTile = (tileId: number) => {
    if (gameState.flippedTiles.length === 2) return;

    let updatedTiles = gameState.tiles.map(tile =>
      tile.id === tileId ? { ...tile, flipped: true } : tile
    );
    let flippedTiles = [...gameState.flippedTiles, tileId];

    let tile = updatedTiles.find(t => t.id === tileId);
    if (!tile) throw new Error("Unexpected missing tile");
    Animated.timing(tile.animation, {
      toValue: 1,
      duration: 300,
      useNativeDriver: true,
    }).start();

    setGameState({ ...gameState, tiles: updatedTiles, flippedTiles });

    if (flippedTiles.length === 2) {
      setTimeout(checkMatch, 1000);
    }
  };

  const checkMatch = () => {
    setGameState((prevState) => {
      const [firstId, secondId] = prevState.flippedTiles;
      let updatedTiles = [...prevState.tiles];
      let score = prevState.score;
      let flippedPairs = prevState.flippedPairs + 1;

      if (updatedTiles[firstId].img === updatedTiles[secondId].img) {
        updatedTiles[firstId].matched = true;
        updatedTiles[secondId].matched = true;
        score++;

        // Set the matched image to full screen
        setFullScreenImage(updatedTiles[firstId].img);

        // Animate the matched image with a bounce effect
        Animated.sequence([
          Animated.spring(scale, {
            toValue: 1.2,
            friction: 3,
            tension: 100,
            useNativeDriver: true,
          }),
        ]).start();
      } else {
        Animated.timing(updatedTiles[firstId].animation, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }).start();
        Animated.timing(updatedTiles[secondId].animation, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }).start();
        updatedTiles[firstId].flipped = false;
        updatedTiles[secondId].flipped = false;
      }

      return {
        tiles: updatedTiles,
        score,
        flippedTiles: [],
        flippedPairs,
      };
    });
  };

  const handleTapFullScreenImage = () => {
    // Start shrinking animation
    Animated.timing(scale, {
      toValue: 0, // Shrink the image to 50% size
      easing: Easing.out(Easing.cubic),
      duration: 150,
      useNativeDriver: true
    }).start(() => {
      // Once the animation is complete, remove the image from the screen
      setFullScreenImage(null);
    });
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {screen !== "title" && (
        <TouchableOpacity onPress={() => setScreen(screen === "game" ? "setup" : "title")} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
      )}

      {screen === "title" && (
        <>
          <Text style={[styles.title, { color: colors.text }]}>Memory Lane</Text>
          <TouchableOpacity onPress={startNewGame} style={styles.button}>
            <Text style={{ color: colors.primary }}>New Game</Text>
          </TouchableOpacity>
        </>
      )}

      {screen === "setup" && (
        <View style={styles.screenContent}>
          <View style={styles.buttonContainer}>
            <TouchableOpacity onPress={pickImage} style={styles.button}>
              <Text style={{ color: colors.primary }}>Pick Images</Text>
            </TouchableOpacity>
            <Text style={{color: colors.secondaryText}}> or </Text>
            <TouchableOpacity onPress={pickAlbum} style={styles.button}>
              <Text style={{ color: colors.primary }}>Pick Album</Text>
            </TouchableOpacity>
          </View>

          <ScrollView horizontal style={styles.imagePreviewContainer}>
            {images.length > 0 ? (
              images.map((img, index) => (
                <Image key={index} source={{ uri: img }} style={styles.thumbnail} />
              ))
            ) : (
              <TouchableOpacity style={styles.placeholderContainer} onPress={pickImage}>
                {[...Array(6)].map((_, index) => (
                  <View key={index} style={{ ...styles.placeholderThumbnail, borderColor: colors.primary + "40" }} />
                ))}
              </TouchableOpacity>
            )}
          </ScrollView>

          {images.length > 0 && (
            <TouchableOpacity onPress={clearImages} style={styles.button}>
              <Text style={{ color: colors.primary }}>Clear Images</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity onPress={startGame} style={[styles.primaryButton, { backgroundColor: colors.primary }]}>
            <Text style={{ color: colors.text }}>Start Game</Text>
          </TouchableOpacity>
        </View>
      )}

      {screen === "game" && (
        <View style={styles.screenContent}>
          <Text style={{ color: colors.text }}>Score: {gameState.score}</Text>
          <Text style={{ color: colors.secondaryText }}>{gameState.flippedPairs} flipped</Text>
          <FlatList
            data={gameState.tiles}
            numColumns={4}
            renderItem={({ item }) => {
              const flipInterpolate = item.animation.interpolate({
                inputRange: [0, 1],
                outputRange: ["0deg", "180deg"]
              });

              return (
                <TouchableOpacity onPress={() => flipTile(item.id)} disabled={item.matched || item.flipped}>
                  <Animated.View style={[styles.tile, { 
                    transform: [{ rotateY: flipInterpolate }],
                    backgroundColor: item.flipped || item.matched ? colors.primary : colors.accent 
                  }]}>
                    {item.flipped || item.matched ? <Image source={{ uri: item.img }} style={styles.image} /> : null}
                  </Animated.View>
                </TouchableOpacity>
              );
            }}
          />
        </View>
      )}

      {/* Full-screen matched image */}
      {fullScreenImage && (
        <TouchableOpacity onPress={handleTapFullScreenImage} style={styles.fullScreenImageContainer} activeOpacity={1}>
          <Animated.Image
            source={{ uri: fullScreenImage }}
            style={[styles.fullScreenImage, { transform: [{ scale }] }]}
          />
        </TouchableOpacity>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", alignItems: "center" }, 
  title: { fontSize: 24, marginBottom: 20 },
  tile: { width: 75, height: 75, margin: 5, justifyContent: "center", alignItems: "center", borderRadius: 10, backfaceVisibility: 'visible' },
  image: { width: 75, height: 75, borderRadius: 10 },
  imagePreviewContainer: { flexDirection: "row", marginVertical: 10 },
  thumbnail: { width: 50, height: 50, marginHorizontal: 5, borderRadius: 5 },
  backButton: { position: "absolute", top: 20, left: 20, padding: 10 },
  button: { fontSize: 18, padding: 10, textAlign: "center" },
  buttonContainer: { flexDirection: "row", justifyContent: "center", alignItems: "center", width: "80%" },
  primaryButton: { 
    fontSize: 18, 
    padding: 10, 
    textAlign: "center", 
    borderRadius: 25, 
    marginTop: 40, 
  },
  screenContent: { width: "100%", paddingHorizontal: 20, alignItems: "center", justifyContent: "center" },
  placeholderContainer: { flexDirection: "row", justifyContent: "center", alignItems: "center" },
  placeholderThumbnail: { width: 50, height: 50, marginHorizontal: 5, borderRadius: 5, borderWidth: 1.5 },
  
  fullScreenImageContainer: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.7)"
  },
  fullScreenImage: {
    width: 300,
    height: 300,
    borderRadius: 10,
  },
});
