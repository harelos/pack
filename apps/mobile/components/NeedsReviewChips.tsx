import { View, Text, Pressable, StyleSheet } from "react-native";
import type { NeedsReviewItem } from "@pack/parser";

/**
 * One-tap fixes (Blueprint 10i/e). "Did 'dilgiot' mean 'Dips'?" [Yes][No].
 * Yes -> write UserExerciseAlias / UserCustomFood so we never ask again.
 */
export function NeedsReviewChips({
  items, onResolve,
}: { items: NeedsReviewItem[]; onResolve: (item: NeedsReviewItem, answer: boolean) => void }) {
  if (!items?.length) return null;
  return (
    <View style={styles.wrap}>
      {items.map((it, i) => (
        <View key={i} style={styles.chip}>
          <Text style={styles.q}>{it.question}</Text>
          <View style={styles.btns}>
            <Pressable style={[styles.btn, styles.yes]} onPress={() => onResolve(it, true)}><Text style={styles.btnText}>Yes</Text></Pressable>
            <Pressable style={[styles.btn, styles.no]} onPress={() => onResolve(it, false)}><Text style={styles.btnText}>Fix</Text></Pressable>
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8, marginTop: 4 },
  chip: { backgroundColor: "#fff7ed", borderRadius: 12, padding: 10, borderWidth: 1, borderColor: "#fed7aa" },
  q: { fontSize: 13, color: "#9a3412", marginBottom: 8 },
  btns: { flexDirection: "row", gap: 8 },
  btn: { paddingVertical: 6, paddingHorizontal: 16, borderRadius: 16 },
  yes: { backgroundColor: "#16a34a" },
  no: { backgroundColor: "#e5e7eb" },
  btnText: { fontSize: 13, fontWeight: "600", color: "#fff" },
});
