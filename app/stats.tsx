import React, { useEffect, useState } from "react";
import { View, Text, TouchableOpacity, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { getRandomScheme, ColorScheme } from "@/lib/theme";
import { shared } from "@/lib/styles";
import { DIFFICULTIES, Difficulty, getOverallStats, OverallStats } from "@/lib/db";

export default function StatsScreen() {
  const router = useRouter();
  const [colors] = useState<ColorScheme>(getRandomScheme());
  const [stats, setStats] = useState<OverallStats | null>(null);

  useEffect(() => {
    getOverallStats().then(setStats);
  }, []);

  return (
    <View style={[shared.container, { backgroundColor: colors.background }]}>
      <TouchableOpacity onPress={() => router.back()} style={shared.backButton}>
        <Ionicons name="arrow-back" size={24} color={colors.text} />
      </TouchableOpacity>

      <ScrollView contentContainerStyle={shared.screenContent}>
        <Text style={[shared.title, { color: colors.text }]}>Stats</Text>

        {!stats ? (
          <Text style={{ color: colors.secondaryText }}>Loading…</Text>
        ) : stats.gamesPlayed === 0 ? (
          <Text style={{ color: colors.secondaryText }}>Play your first game to start building stats!</Text>
        ) : (
          <>
            <View style={[shared.card, { backgroundColor: colors.accent + "60" }]}>
              <Row label="Games played" value={String(stats.gamesPlayed)} colors={colors} />
              <Row label="Total matches" value={String(stats.totalMatches)} colors={colors} />
              <Row label="Total flips" value={String(stats.totalFlips)} colors={colors} />
              <Row label="Best combo" value={`x${stats.bestCombo}`} colors={colors} />
              <Row label="Current win streak" value={String(stats.currentWinStreak)} colors={colors} />
              <Row label="Best win streak" value={String(stats.bestWinStreak)} colors={colors} />
            </View>

            <Text style={[shared.sectionLabel, { color: colors.secondaryText }]}>Best Times</Text>
            <View style={[shared.card, { backgroundColor: colors.accent + "60" }]}>
              {(Object.keys(DIFFICULTIES) as Difficulty[]).map((d) => (
                <Row
                  key={d}
                  label={DIFFICULTIES[d].label}
                  value={
                    stats.bestTimeByDifficulty[d] !== undefined
                      ? `${stats.bestTimeByDifficulty[d]}s · ${stats.bestFlipsByDifficulty[d]} flips`
                      : "—"
                  }
                  colors={colors}
                />
              ))}
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

function Row({ label, value, colors }: { label: string; value: string; colors: ColorScheme }) {
  return (
    <View style={shared.row}>
      <Text style={{ color: colors.text }}>{label}</Text>
      <Text style={{ color: colors.secondaryText }}>{value}</Text>
    </View>
  );
}
