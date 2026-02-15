import { type PropsWithChildren } from 'react';
import { StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

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
