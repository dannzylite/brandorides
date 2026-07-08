import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';
import { FlightPathArc } from './FlightPathArc';
import { Colors, Spacing, Typography } from '@/constants/theme';

interface ScreenContainerProps {
  title: string;
  subtitle?: string;
  showArc?: boolean;
  scroll?: boolean;
  edges?: Edge[];
  footer?: React.ReactNode;
  children: React.ReactNode;
}

export function ScreenContainer({
  title,
  subtitle,
  showArc = false,
  scroll = true,
  edges = ['top', 'right', 'bottom', 'left'],
  footer,
  children,
}: ScreenContainerProps) {
  const Body = scroll ? ScrollView : View;
  const bodyProps = scroll
    ? { contentContainerStyle: styles.scrollContent, showsVerticalScrollIndicator: false }
    : { style: styles.scrollContent };

  return (
    <SafeAreaView style={styles.safeArea} edges={edges}>
      <View style={styles.header}>
        <Text style={styles.title}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        {showArc ? (
          <View style={styles.arc}>
            <FlightPathArc />
          </View>
        ) : null}
      </View>
      <Body {...bodyProps}>{children}</Body>
      {footer ? <View style={styles.footer}>{footer}</View> : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.base,
  },
  title: {
    ...Typography.h1,
    color: Colors.text,
  },
  subtitle: {
    ...Typography.body,
    color: Colors.subtext,
    marginTop: Spacing.xs,
  },
  arc: {
    marginTop: Spacing.sm,
  },
  scrollContent: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.base,
    paddingBottom: Spacing.xxl,
    gap: Spacing.base,
  },
  footer: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.base,
    paddingBottom: Spacing.base,
  },
});
