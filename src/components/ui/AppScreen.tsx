import { type PropsWithChildren } from 'react';
import { SafeAreaView, StyleSheet } from 'react-native';

import { colors } from '@/src/theme';

export function AppScreen({ children }: PropsWithChildren) {
  return <SafeAreaView style={styles.container}>{children}</SafeAreaView>;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
});
