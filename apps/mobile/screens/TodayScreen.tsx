import { useRef, useState } from "react";
import {
  View, Text, TextInput, Pressable, ScrollView, ActivityIndicator, StyleSheet,
} from "react-native";
import { parse, ParseResponse } from "../lib/api";
import { ConfidenceBar } from "../components/ConfidenceBar";
import { NeedsReviewChips } from "../components/NeedsReviewChips";

/**
 * Compose-first Today screen. ONE dominant element: the composer (Blueprint 10k).
 * Runway / readiness / timeline recede below it.
 */
export function TodayScreen() {
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ParseResponse | null>(null);
  const idemRef = useRef<string>("");

  async function onLog(source: "text" | "voice" | "photo") {
    if (!text.trim() || loading) return;
    setLoading(true);
    // One token per compose session; rapid double-tap reuses it (no dup parse).
    if (!idemRef.current) idemRef.current = `${Date.now()}-${Math.round(Math.random() * 1e6)}`;
    try {
      const r = await parse(text, source, idemRef.current, /* accessToken */ "TODO");
      setResult(r);
    } catch (e) {
      // TODO: toast the error; queue offline.
      console.warn(e);
    } finally {
      setLoading(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      {/* HERO: the composer */}
      <View style={styles.hero}>
        <TextInput
          style={styles.input}
          placeholder="Dump your day — food or training, any language"
          placeholderTextColor="#9aa0a6"
          multiline
          value={text}
          onChangeText={(t) => { setText(t); idemRef.current = ""; }}
          editable={!loading}
        />
        <View style={styles.actionRow}>
          <Pressable style={styles.iconBtn} onPress={() => onLog("voice")}><Text style={styles.icon}>🎤</Text></Pressable>
          <Pressable style={styles.iconBtn} onPress={() => onLog("photo")}><Text style={styles.icon}>📷</Text></Pressable>
          <Pressable style={[styles.logBtn, loading && styles.logBtnDisabled]} onPress={() => onLog("text")} disabled={loading}>
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.logBtnText}>Log it</Text>}
          </Pressable>
        </View>
      </View>

      {/* Parse preview sheet */}
      {result && (
        <View style={styles.preview}>
          <ConfidenceBar value={result.overallConfidence} />
          {result.parse.entries.flatMap((e) => e.meal_items ?? []).map((m, i) => (
            <View key={`m${i}`} style={styles.row}>
              <Text style={styles.rowName}>{m.verbatim_name}</Text>
              <Text style={styles.rowMeta}>{m.lookup_needed ? "macros pending" : `conf ${Math.round(m.confidence_score * 100)}%`}</Text>
            </View>
          ))}
          {result.parse.entries.flatMap((e) => e.workout_session?.set_groups ?? []).map((g, i) => (
            <View key={`g${i}`} style={styles.row}>
              <Text style={styles.rowName}>{g.verbatim_name}</Text>
              <Text style={styles.rowMeta}>{g.kind} · {g.sets.length} sets</Text>
            </View>
          ))}
          <NeedsReviewChips items={result.parse.needs_review} onResolve={() => { /* write alias / custom food */ }} />
        </View>
      )}

      {/* Below-the-hero, recessed */}
      <Text style={styles.sectionLabel}>Week runway</Text>
      <View style={styles.recessedCard}><Text style={styles.recessedText}>Rebalances daily — missed days roll into next week.</Text></View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 16 },
  hero: { backgroundColor: "#111418", borderRadius: 20, padding: 16, gap: 12 },
  input: { minHeight: 120, color: "#fff", fontSize: 18, textAlignVertical: "top" },
  actionRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  iconBtn: { width: 48, height: 48, borderRadius: 24, backgroundColor: "#22262c", alignItems: "center", justifyContent: "center" },
  icon: { fontSize: 20 },
  logBtn: { flex: 1, height: 48, borderRadius: 24, backgroundColor: "#2b7fff", alignItems: "center", justifyContent: "center" },
  logBtnDisabled: { opacity: 0.6 },
  logBtnText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  preview: { backgroundColor: "#fff", borderRadius: 16, padding: 14, gap: 8 },
  row: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 6, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#e5e7eb" },
  rowName: { fontSize: 15, color: "#111", flexShrink: 1 },
  rowMeta: { fontSize: 12, color: "#6b7280" },
  sectionLabel: { fontSize: 13, color: "#6b7280", marginTop: 8 },
  recessedCard: { backgroundColor: "#f3f4f6", borderRadius: 12, padding: 12 },
  recessedText: { color: "#4b5563", fontSize: 13 },
});
