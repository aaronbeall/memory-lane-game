import React, { useCallback, useState } from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { getRandomScheme, ColorScheme } from "@/lib/theme";
import { shared } from "@/lib/styles";
import { loadGameState } from "@/lib/db";

export default function TitleScreen() {
  const router = useRouter();
  const [colors, setColors] = useState<ColorScheme>(getRandomScheme());
  const [hasContinue, setHasContinue] = useState(false);
  const [hasPrevious, setHasPrevious] = useState(false);

  useFocusEffect(
    useCallback(() => {
      setColors(getRandomScheme());
      loadGameState("current").then((s) => setHasContinue(!!s));
      loadGameState("previous").then((s) => setHasPrevious(!!s));
    }, [])
  );

  return (
    <View style={[shared.centered, { backgroundColor: colors.background }]}>
      <Text style={{ fontSize: 40, marginBottom: 6 }}>🖼️</Text>
      <Text style={[shared.title, { color: colors.text }]}>Memory Lane</Text>
      <Text style={{ color: colors.secondaryText, marginBottom: 30 }}>A matching game made of your own photos</Text>

      <View style={{ gap: 14, alignItems: "center" }}>
        {hasContinue && (
          <TouchableOpacity onPress={() => router.push({ pathname: "/game", params: { resume: "current" } })} style={[shared.primaryButton, { backgroundColor: colors.primary }]}>
            <Text style={{ color: colors.text }}>Continue Game</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity onPress={() => router.push("/setup")} style={[shared.primaryButton, { backgroundColor: colors.primary }]}>
          <Text style={{ color: colors.text }}>New Game</Text>
        </TouchableOpacity>

        {hasPrevious && (
          <TouchableOpacity onPress={() => router.push({ pathname: "/game", params: { resume: "previous" } })} style={shared.button}>
            <Text style={{ color: colors.text }}>Replay Previous</Text>
          </TouchableOpacity>
        )}

        <View style={{ flexDirection: "row", gap: 20, marginTop: 10 }}>
          <TouchableOpacity onPress={() => router.push("/favorites")} style={shared.smallButton}>
            <Text style={{ color: colors.secondaryText }}>❤️ Favorites</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => router.push("/stats")} style={shared.smallButton}>
            <Text style={{ color: colors.secondaryText }}>📊 Stats</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}
