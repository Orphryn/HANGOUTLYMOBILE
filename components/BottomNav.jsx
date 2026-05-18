import { router } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { colors, shadow, softShadow } from "../constants/theme";

export default function BottomNav({ active = "home" }) {
  const [open, setOpen] = useState(false);

  function go(path) {
    setOpen(false);
    router.push(path);
  }

  function NavItem({ id, label, icon, path }) {
    const selected = active === id;

    return (
      <Pressable
        onPress={() => go(path)}
        style={[styles.navItem, selected && styles.navItemActive]}
      >
        <View style={[styles.iconWrap, selected && styles.iconWrapActive]}>
          <Text style={[styles.navIcon, selected && styles.navIconActive]}>
            {icon}
          </Text>
        </View>

        <Text style={[styles.navText, selected && styles.navTextActive]}>
          {label}
        </Text>
      </Pressable>
    );
  }

  return (
    <View pointerEvents="box-none" style={styles.wrap}>
      {open && (
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={styles.bubbleMenu} onPress={() => {}}>
            <Pressable onPress={() => go("/create-plan")} style={styles.bubble}>
              <View style={styles.planIcon}>
                <Text style={styles.bubbleIconText}>□</Text>
              </View>

              <View style={{ flex: 1 }}>
                <Text style={styles.bubbleTitle}>Create Plan</Text>
                <Text style={styles.bubbleSub}>Task or event</Text>
              </View>

              <Text style={styles.bubbleArrow}>›</Text>
            </Pressable>

            <Pressable onPress={() => go("/create-group")} style={styles.bubble}>
              <View style={styles.groupIcon}>
                <Text style={styles.bubbleIconText}>♙</Text>
              </View>

              <View style={{ flex: 1 }}>
                <Text style={styles.bubbleTitle}>Create Group</Text>
                <Text style={styles.bubbleSub}>Start a room</Text>
              </View>

              <Text style={styles.bubbleArrow}>›</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      )}

      <View style={styles.dock}>
        <NavItem id="home" label="Home" icon="⌂" path="/dashboard" />
        <NavItem id="groups" label="Groups" icon="♙" path="/groups" />

        <View style={styles.centerSlot}>
          <Pressable
            onPress={() => setOpen((value) => !value)}
            style={[styles.plusButton, open && styles.plusButtonOpen]}
          >
            <Text style={styles.plusText}>{open ? "×" : "+"}</Text>
          </Pressable>
        </View>

        <NavItem id="plans" label="Plans" icon="□" path="/planner" />
        <NavItem id="safety" label="Safety" icon="♡" path="/safety" />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: 245,
    justifyContent: "flex-end",
    pointerEvents: "box-none",
  },

  backdrop: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "flex-end",
    paddingHorizontal: 18,
    paddingBottom: 100,
  },

  bubbleMenu: {
    alignSelf: "center",
    width: "100%",
    maxWidth: 360,
    backgroundColor: colors.bg2,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 30,
    padding: 10,
    gap: 10,
    ...shadow,
  },

  bubble: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 23,
    padding: 13,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },

  planIcon: {
    width: 48,
    height: 48,
    borderRadius: 18,
    backgroundColor: colors.violet,
    alignItems: "center",
    justifyContent: "center",
  },

  groupIcon: {
    width: 48,
    height: 48,
    borderRadius: 18,
    backgroundColor: colors.green,
    alignItems: "center",
    justifyContent: "center",
  },

  bubbleIconText: {
    color: colors.text,
    fontWeight: "900",
    fontSize: 21,
  },

  bubbleTitle: {
    color: colors.text,
    fontWeight: "900",
    fontSize: 16,
  },

  bubbleSub: {
    color: colors.muted,
    fontWeight: "800",
    marginTop: 2,
    fontSize: 12,
  },

  bubbleArrow: {
    color: colors.violet,
    fontSize: 30,
    fontWeight: "900",
  },

  dock: {
    position: "absolute",
    left: 18,
    right: 18,
    bottom: 18,
    height: 76,
    borderRadius: 34,
    backgroundColor: "rgba(17, 24, 39, 0.96)",
    borderWidth: 1,
    borderColor: "rgba(70, 100, 136, 0.85)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 10,
    overflow: "visible",
    ...softShadow,
  },

  navItem: {
    flex: 1,
    height: 62,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
  },

  navItemActive: {
    backgroundColor: "rgba(124, 92, 255, 0.14)",
    borderWidth: 1,
    borderColor: "rgba(124, 92, 255, 0.32)",
  },

  iconWrap: {
    width: 28,
    height: 24,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },

  iconWrapActive: {
    backgroundColor: "rgba(124, 92, 255, 0.18)",
  },

  navIcon: {
    color: colors.muted,
    fontWeight: "900",
    fontSize: 16,
  },

  navIconActive: {
    color: colors.violet,
    fontSize: 17,
  },

  navText: {
    color: colors.muted,
    fontSize: 10,
    fontWeight: "900",
  },

  navTextActive: {
    color: colors.text,
  },

  centerSlot: {
    width: 70,
    alignItems: "center",
    justifyContent: "center",
  },

  plusButton: {
    width: 62,
    height: 62,
    borderRadius: 999,
    backgroundColor: colors.violet,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 4,
    borderColor: colors.bg,
    marginTop: -34,
    ...shadow,
  },

  plusButtonOpen: {
    backgroundColor: colors.red,
  },

  plusText: {
    color: colors.text,
    fontSize: 38,
    fontWeight: "600",
    marginTop: -4,
  },
});