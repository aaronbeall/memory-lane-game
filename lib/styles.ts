import { StyleSheet } from "react-native";

export const shared = StyleSheet.create({
  container: { flex: 1, alignItems: "center" },
  centered: { flex: 1, justifyContent: "center", alignItems: "center" },
  title: { fontSize: 24, marginBottom: 20, fontWeight: "600" },
  subtitle: { fontSize: 16, marginBottom: 10 },
  backButton: { position: "absolute", top: 20, left: 20, padding: 10, zIndex: 20 },
  button: { fontSize: 18, padding: 10, textAlign: "center" },
  smallButton: { fontSize: 14, padding: 8, textAlign: "center" },
  buttonContainer: { flexDirection: "row", justifyContent: "center", alignItems: "center", flexWrap: "wrap", width: "90%", gap: 12 },
  primaryButton: {
    fontSize: 18,
    padding: 12,
    paddingHorizontal: 20,
    textAlign: "center",
    borderRadius: 25,
  },
  disabledButton: { opacity: 0.4 },
  screenContent: { width: "100%", paddingHorizontal: 20, alignItems: "center", paddingTop: 70, paddingBottom: 20 },
  sectionLabel: { fontSize: 14, fontWeight: "600", marginTop: 20, marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.5 },
  card: { width: "100%", borderRadius: 14, padding: 14, marginBottom: 10 },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", width: "100%" },
});
