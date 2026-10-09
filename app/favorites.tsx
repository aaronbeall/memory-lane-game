import React, { useCallback, useState } from "react";
import { View, Text, TouchableOpacity, Image, FlatList, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { getRandomScheme, ColorScheme } from "@/lib/theme";
import { shared } from "@/lib/styles";
import { PhotoHistoryRow, getExcludedPhotos, getHeartedPhotos, setExcluded, setHearted } from "@/lib/db";

type Tab = "hearted" | "excluded";

export default function FavoritesScreen() {
  const router = useRouter();
  const [colors] = useState<ColorScheme>(getRandomScheme());
  const [tab, setTab] = useState<Tab>("hearted");
  const [hearted, setHeartedList] = useState<PhotoHistoryRow[]>([]);
  const [excluded, setExcludedList] = useState<PhotoHistoryRow[]>([]);

  const reload = useCallback(() => {
    getHeartedPhotos().then(setHeartedList);
    getExcludedPhotos().then(setExcludedList);
  }, []);

  useFocusEffect(reload);

  const unheart = async (row: PhotoHistoryRow) => {
    await setHearted(row.hash, false);
    reload();
  };

  const unexclude = async (row: PhotoHistoryRow) => {
    await setExcluded(row.hash, false);
    reload();
  };

  const list = tab === "hearted" ? hearted : excluded;

  return (
    <View style={[shared.container, { backgroundColor: colors.background }]}>
      <TouchableOpacity onPress={() => router.back()} style={shared.backButton}>
        <Ionicons name="arrow-back" size={24} color={colors.text} />
      </TouchableOpacity>

      <View style={{ paddingTop: 70, alignItems: "center", width: "100%" }}>
        <Text style={[shared.title, { color: colors.text }]}>Photos</Text>
        <View style={shared.buttonContainer}>
          <TouchableOpacity onPress={() => setTab("hearted")} style={[styles.chip, { backgroundColor: tab === "hearted" ? colors.primary : colors.accent + "80" }]}>
            <Text style={{ color: colors.text }}>❤️ Favorites ({hearted.length})</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setTab("excluded")} style={[styles.chip, { backgroundColor: tab === "excluded" ? colors.primary : colors.accent + "80" }]}>
            <Text style={{ color: colors.text }}>🚫 Excluded ({excluded.length})</Text>
          </TouchableOpacity>
        </View>
      </View>

      {list.length === 0 ? (
        <Text style={{ color: colors.secondaryText, marginTop: 30 }}>
          {tab === "hearted" ? "Heart photos during a game to save them here." : "Photos you exclude during a game show up here."}
        </Text>
      ) : (
        <FlatList
          data={list}
          numColumns={3}
          contentContainerStyle={{ paddingTop: 20, paddingHorizontal: 10 }}
          keyExtractor={(item) => item.hash}
          renderItem={({ item }) => (
            <TouchableOpacity onPress={() => (tab === "hearted" ? unheart(item) : unexclude(item))} style={styles.thumbWrap}>
              <Image source={{ uri: item.uri }} style={styles.thumb} />
              <View style={styles.badge}>
                <Ionicons name={tab === "hearted" ? "heart" : "eye-off"} size={16} color="#FFF" />
              </View>
            </TouchableOpacity>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  chip: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 20 },
  thumbWrap: { width: 100, height: 100, margin: 5, borderRadius: 10, overflow: "hidden" },
  thumb: { width: "100%", height: "100%" },
  badge: { position: "absolute", bottom: 4, right: 4, backgroundColor: "rgba(0,0,0,0.5)", borderRadius: 12, padding: 4 },
});
