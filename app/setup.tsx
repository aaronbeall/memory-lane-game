import React, { useEffect, useState } from "react";
import { View, Text, TouchableOpacity, ScrollView, Image, Alert, ActivityIndicator, StyleSheet } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { getRandomScheme, ColorScheme } from "@/lib/theme";
import { shared } from "@/lib/styles";
import { Difficulty, DIFFICULTIES } from "@/lib/db";
import { minPhotosFor } from "@/lib/gameEngine";
import { Album, listAlbums, requestMediaLibraryPermission } from "@/lib/photoSource";
import { smartPick, randomPick, pickFavorites, hashManualPicks, RecencyPreference } from "@/lib/smartPick";
import { setPendingGame } from "@/lib/pendingGame";

type Source = "albums" | "all" | "manual";
type Mode = "smart" | "random";

export default function SetupScreen() {
  const router = useRouter();
  const [colors] = useState<ColorScheme>(getRandomScheme());

  const [source, setSource] = useState<Source>("all");
  const [mode, setMode] = useState<Mode>("smart");
  const [preference, setPreference] = useState<RecencyPreference>("balanced");
  const [difficulty, setDifficulty] = useState<Difficulty>("medium");

  const [albums, setAlbums] = useState<Album[]>([]);
  const [selectedAlbumIds, setSelectedAlbumIds] = useState<string[]>([]);
  const [albumsLoading, setAlbumsLoading] = useState(false);

  const [manualUris, setManualUris] = useState<string[]>([]);

  const [building, setBuilding] = useState(false);

  useEffect(() => {
    if (source === "albums" && albums.length === 0) {
      loadAlbums();
    }
  }, [source]);

  const loadAlbums = async () => {
    setAlbumsLoading(true);
    try {
      const granted = await requestMediaLibraryPermission();
      if (!granted) {
        Alert.alert("Permission Required", "Photo library access is needed to browse albums.");
        return;
      }
      const list = await listAlbums();
      setAlbums(list);
    } catch {
      Alert.alert("Couldn't Load Albums", "Something went wrong reading your photo albums.");
    } finally {
      setAlbumsLoading(false);
    }
  };

  const toggleAlbum = (id: string) => {
    setSelectedAlbumIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const pickManualImages = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({ allowsMultipleSelection: true, quality: 0.8 });
    if (!result.canceled) {
      setManualUris((prev) => [...prev, ...result.assets.map((a) => a.uri)]);
    }
  };

  const startGame = async () => {
    const need = minPhotosFor(difficulty);
    setBuilding(true);
    try {
      let photos: { hash: string; uri: string }[] = [];
      let sourceDescription = "";

      if (source === "manual") {
        if (manualUris.length < need) {
          Alert.alert("Not Enough Images", `Pick at least ${need} images for this difficulty.`);
          return;
        }
        const picked = await hashManualPicks(manualUris);
        photos = picked;
        sourceDescription = "Your picks";
      } else {
        if (source === "albums" && selectedAlbumIds.length === 0) {
          Alert.alert("Pick an Album", "Select at least one album to build a game from.");
          return;
        }
        const albumIds = source === "albums" ? selectedAlbumIds : undefined;
        const picked =
          mode === "smart"
            ? await smartPick({ albumIds, count: need, preference })
            : await randomPick({ albumIds, count: need });

        if (picked.length < need) {
          Alert.alert(
            "Not Enough Photos Found",
            `Only found ${picked.length} good, unique photos. Try "All Photos", a bigger album, or a smaller difficulty.`
          );
          return;
        }
        photos = picked;
        sourceDescription = source === "albums" ? `${selectedAlbumIds.length} album(s)` : "All Photos";
      }

      setPendingGame({ difficulty, photos, sourceDescription });
      router.push("/game");
    } catch {
      Alert.alert("Couldn't Build Game", "Something went wrong picking photos. Please try again.");
    } finally {
      setBuilding(false);
    }
  };

  const startFavorites = async () => {
    const need = minPhotosFor(difficulty);
    setBuilding(true);
    try {
      const picked = await pickFavorites(need);
      if (picked.length < need) {
        Alert.alert("Not Enough Favorites", `You've hearted ${picked.length} photo(s) — need at least ${need} for this difficulty.`);
        return;
      }
      setPendingGame({ difficulty, photos: picked, sourceDescription: "Favorites" });
      router.push("/game");
    } catch {
      Alert.alert("Couldn't Build Game", "Something went wrong picking photos. Please try again.");
    } finally {
      setBuilding(false);
    }
  };

  return (
    <View style={[shared.container, { backgroundColor: colors.background }]}>
      <TouchableOpacity onPress={() => router.back()} style={shared.backButton}>
        <Ionicons name="arrow-back" size={24} color={colors.text} />
      </TouchableOpacity>

      <ScrollView contentContainerStyle={shared.screenContent}>
        <Text style={[shared.title, { color: colors.text }]}>New Game</Text>

        <Text style={[shared.sectionLabel, { color: colors.secondaryText }]}>Difficulty</Text>
        <View style={shared.buttonContainer}>
          {(Object.keys(DIFFICULTIES) as Difficulty[]).map((d) => (
            <Chip key={d} label={`${DIFFICULTIES[d].label} (${DIFFICULTIES[d].pairs})`} active={difficulty === d} colors={colors} onPress={() => setDifficulty(d)} />
          ))}
        </View>

        <Text style={[shared.sectionLabel, { color: colors.secondaryText }]}>Photo Source</Text>
        <View style={shared.buttonContainer}>
          <Chip label="All Photos" active={source === "all"} colors={colors} onPress={() => setSource("all")} />
          <Chip label="Albums" active={source === "albums"} colors={colors} onPress={() => setSource("albums")} />
          <Chip label="My Picks" active={source === "manual"} colors={colors} onPress={() => setSource("manual")} />
        </View>

        {source === "albums" && (
          <View style={{ width: "100%", marginTop: 10 }}>
            {albumsLoading ? (
              <ActivityIndicator color={colors.primary} />
            ) : (
              <ScrollView style={{ maxHeight: 160 }}>
                {albums.map((a) => (
                  <TouchableOpacity key={a.id} onPress={() => toggleAlbum(a.id)} style={[styles.albumRow, { borderColor: colors.primary + "40" }]}>
                    <Text style={{ color: colors.text }}>{selectedAlbumIds.includes(a.id) ? "☑" : "☐"} {a.title}</Text>
                    <Text style={{ color: colors.secondaryText }}>{a.assetCount}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
          </View>
        )}

        {source === "manual" && (
          <View style={{ width: "100%", alignItems: "center", marginTop: 10 }}>
            <TouchableOpacity onPress={pickManualImages} style={[shared.primaryButton, { backgroundColor: colors.primary }]}>
              <Text style={{ color: colors.text }}>Pick Images ({manualUris.length})</Text>
            </TouchableOpacity>
            {manualUris.length > 0 && (
              <ScrollView horizontal style={{ marginTop: 10 }}>
                {manualUris.map((uri, i) => (
                  <Image key={i} source={{ uri }} style={styles.thumbnail} />
                ))}
              </ScrollView>
            )}
          </View>
        )}

        {source !== "manual" && (
          <>
            <Text style={[shared.sectionLabel, { color: colors.secondaryText }]}>Selection</Text>
            <View style={shared.buttonContainer}>
              <Chip label="✨ Smart Pick" active={mode === "smart"} colors={colors} onPress={() => setMode("smart")} />
              <Chip label="🎲 Random" active={mode === "random"} colors={colors} onPress={() => setMode("random")} />
            </View>

            {mode === "smart" && (
              <View style={shared.buttonContainer}>
                <Chip label="Surprise Me" active={preference === "surprise"} colors={colors} onPress={() => setPreference("surprise")} />
                <Chip label="Balanced" active={preference === "balanced"} colors={colors} onPress={() => setPreference("balanced")} />
                <Chip label="Memory Lane" active={preference === "familiar"} colors={colors} onPress={() => setPreference("familiar")} />
              </View>
            )}
          </>
        )}

        {building ? (
          <ActivityIndicator style={{ marginTop: 30 }} color={colors.primary} />
        ) : (
          <>
            <TouchableOpacity onPress={startGame} style={[shared.primaryButton, { backgroundColor: colors.primary, marginTop: 30 }]}>
              <Text style={{ color: colors.text }}>Start Game</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={startFavorites} style={shared.button}>
              <Text style={{ color: colors.secondaryText }}>❤️ Play Favorites Instead</Text>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
    </View>
  );
}

function Chip({ label, active, colors, onPress }: { label: string; active: boolean; colors: ColorScheme; onPress: () => void }) {
  return (
    <TouchableOpacity onPress={onPress} style={[styles.chip, { backgroundColor: active ? colors.primary : colors.accent + "80" }]}>
      <Text style={{ color: colors.text }}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  chip: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 20 },
  thumbnail: { width: 50, height: 50, marginHorizontal: 5, borderRadius: 5 },
  albumRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 10, borderBottomWidth: 1 },
});
