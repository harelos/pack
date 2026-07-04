import { NavigationContainer } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { View, Text, StyleSheet } from "react-native";
import { StatusBar } from "expo-status-bar";
import { TodayScreen } from "./screens/TodayScreen";
import { InsightsScreen } from "./screens/InsightsScreen";

const Tab = createBottomTabNavigator();

function Placeholder({ label }: { label: string }) {
  return (
    <View style={styles.center}><Text style={styles.ph}>{label}</Text></View>
  );
}
const MeScreen = () => <Placeholder label="Me — goals, aliases, export, upgrade" />;

export default function App() {
  return (
    <NavigationContainer>
      <StatusBar style="auto" />
      <Tab.Navigator screenOptions={{ headerShown: true }}>
        <Tab.Screen name="Today" component={TodayScreen} options={{ tabBarLabel: "Today" }} />
        <Tab.Screen name="Insights" component={InsightsScreen} />
        <Tab.Screen name="Me" component={MeScreen} />
      </Tab.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  ph: { color: "#6b7280", textAlign: "center" },
});
