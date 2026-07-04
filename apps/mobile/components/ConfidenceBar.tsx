import { View, Text, StyleSheet } from "react-native";

// Width set via style prop in JS after mount, never inline-HTML (Blueprint 10c).
export function ConfidenceBar({ value }: { value: number }) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  const color = pct >= 85 ? "#16a34a" : pct >= 70 ? "#f59e0b" : "#ef4444";
  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>Parse confidence {Math.round(pct)}%</Text>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${pct}%`, backgroundColor: color }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 4 },
  label: { fontSize: 12, color: "#6b7280" },
  track: { height: 6, borderRadius: 3, backgroundColor: "#e5e7eb", overflow: "hidden" },
  fill: { height: 6, borderRadius: 3 },
});
