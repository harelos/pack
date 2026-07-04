import { useEffect, useState } from "react";
import { View, Text, ScrollView, ActivityIndicator, StyleSheet } from "react-native";
import Constants from "expo-constants";

const BASE = (Constants.expoConfig?.extra?.apiBaseUrl as string) ?? "http://localhost:3000";

interface InsightCard {
  kind: string;
  message: string | null;
  visual: { chart: string };
}

export function InsightsScreen() {
  const [cards, setCards] = useState<InsightCard[] | null>(null);

  useEffect(() => {
    // TODO: pass real access token.
    fetch(`${BASE}/api/insights`, { headers: { Authorization: "Bearer TODO" } })
      .then((r) => r.json())
      .then((d) => setCards(d.cards ?? []))
      .catch(() => setCards([]));
  }, []);

  if (!cards) return <View style={styles.center}><ActivityIndicator /></View>;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      {cards.length === 0 && (
        <Text style={styles.empty}>Keep logging — insights unlock after ~4 weeks of data.</Text>
      )}
      {cards.map((c, i) => (
        <View key={i} style={styles.card}>
          <Text style={styles.tag}>{c.kind}</Text>
          <Text style={styles.body}>{c.message}</Text>
          <View style={styles.chartStub}><Text style={styles.chartLabel}>[{c.visual.chart}]</Text></View>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  container: { padding: 16, gap: 12 },
  empty: { color: "#6b7280", textAlign: "center", marginTop: 40 },
  card: { backgroundColor: "#fff", borderRadius: 16, padding: 16, gap: 10, borderWidth: 1, borderColor: "#eef0f2" },
  tag: { fontSize: 11, textTransform: "uppercase", color: "#2b7fff", fontWeight: "700", letterSpacing: 0.5 },
  body: { fontSize: 15, color: "#111", lineHeight: 21 },
  chartStub: { height: 120, backgroundColor: "#f8fafc", borderRadius: 12, alignItems: "center", justifyContent: "center" },
  chartLabel: { color: "#9aa0a6", fontSize: 12 },
});
