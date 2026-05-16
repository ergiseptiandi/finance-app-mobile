import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Animated, Easing, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { Colors, alpha, type AppColorTheme } from '@/constants/theme';

type ShimmerBlockProps = {
  colors: AppColorTheme;
  style?: StyleProp<ViewStyle>;
  tone?: 'default' | 'inverse';
};

export function ShimmerBlock({ colors, style, tone = 'default' }: ShimmerBlockProps) {
  const translateX = useRef(new Animated.Value(-140)).current;
  const [width, setWidth] = useState(220);
  const isDark = colors === Colors.dark;
  const baseColor =
    tone === 'inverse'
      ? alpha(colors.onPrimary, isDark ? 0.18 : 0.16)
      : alpha(colors.shellTextPrimary, isDark ? 0.08 : 0.06);
  const glowColor =
    tone === 'inverse'
      ? alpha(colors.onPrimary, isDark ? 0.24 : 0.3)
      : alpha(colors.surfaceContainerLowest, isDark ? 0.14 : 0.7);

  useEffect(() => {
    translateX.setValue(-140);

    const shimmerLoop = Animated.loop(
      Animated.timing(translateX, {
        toValue: width + 140,
        duration: 1100,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: true,
      })
    );

    shimmerLoop.start();

    return () => {
      shimmerLoop.stop();
    };
  }, [translateX, width]);

  return (
    <View
      onLayout={(event) => {
        const nextWidth = Math.max(120, Math.round(event.nativeEvent.layout.width));
        if (nextWidth !== width) {
          setWidth(nextWidth);
        }
      }}
      style={[skeletonStyles.block, { backgroundColor: baseColor }, style]}>
      <Animated.View
        pointerEvents="none"
        style={[
          skeletonStyles.glow,
          {
            backgroundColor: glowColor,
            transform: [{ translateX }],
          },
        ]}
      />
    </View>
  );
}

function SkeletonCard({
  colors,
  children,
  style,
}: {
  colors: AppColorTheme;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View
      style={[
        skeletonStyles.card,
        {
          backgroundColor: colors.shellCard,
          borderColor: colors.shellBorder,
        },
        style,
      ]}>
      {children}
    </View>
  );
}

function HeroSkeleton({
  colors,
  children,
  style,
}: {
  colors: AppColorTheme;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[skeletonStyles.hero, { backgroundColor: colors.primary }, style]}>
      {children}
    </View>
  );
}

function MetricGrid({
  colors,
  count = 4,
}: {
  colors: AppColorTheme;
  count?: number;
}) {
  return (
    <View style={skeletonStyles.metricGrid}>
      {Array.from({ length: count }).map((_, index) => (
        <SkeletonCard key={index} colors={colors} style={skeletonStyles.metricCard}>
          <ShimmerBlock colors={colors} style={skeletonStyles.metricIcon} />
          <ShimmerBlock colors={colors} style={skeletonStyles.metricLabel} />
          <ShimmerBlock colors={colors} style={skeletonStyles.metricValue} />
          <ShimmerBlock colors={colors} style={skeletonStyles.metricMeta} />
        </SkeletonCard>
      ))}
    </View>
  );
}

export function DashboardSkeleton({ colors }: { colors: AppColorTheme }) {
  return (
    <>
      <HeroSkeleton colors={colors}>
        <ShimmerBlock colors={colors} tone="inverse" style={skeletonStyles.heroKicker} />
        <ShimmerBlock colors={colors} tone="inverse" style={skeletonStyles.heroValue} />
        <View style={skeletonStyles.heroRow}>
          <ShimmerBlock colors={colors} tone="inverse" style={skeletonStyles.heroChip} />
          <ShimmerBlock colors={colors} tone="inverse" style={skeletonStyles.heroHint} />
        </View>
      </HeroSkeleton>

      <SkeletonCard colors={colors}>
        <View style={skeletonStyles.rowBetween}>
          <View style={skeletonStyles.fill}>
            <ShimmerBlock colors={colors} style={skeletonStyles.sectionEyebrow} />
            <ShimmerBlock colors={colors} style={skeletonStyles.sectionValue} />
          </View>
          <ShimmerBlock colors={colors} style={skeletonStyles.sectionIcon} />
        </View>
        <ShimmerBlock colors={colors} style={skeletonStyles.progressBar} />
        <View style={skeletonStyles.heroRow}>
          <ShimmerBlock colors={colors} style={skeletonStyles.metaLineWide} />
          <ShimmerBlock colors={colors} style={skeletonStyles.metaLine} />
        </View>
      </SkeletonCard>

      <SkeletonCard colors={colors}>
        <View style={skeletonStyles.rowBetween}>
          <ShimmerBlock colors={colors} style={skeletonStyles.sectionTitle} />
          <ShimmerBlock colors={colors} style={skeletonStyles.segmentedControl} />
        </View>
        <View style={skeletonStyles.chartRow}>
          {Array.from({ length: 7 }).map((_, index) => (
            <View key={index} style={skeletonStyles.chartItem}>
              <ShimmerBlock
                colors={colors}
                style={[
                  skeletonStyles.chartBar,
                  {
                    height: 50 + ((index % 4) + 1) * 18,
                  },
                ]}
              />
              <ShimmerBlock colors={colors} style={skeletonStyles.chartLabel} />
            </View>
          ))}
        </View>
      </SkeletonCard>

      <SkeletonCard colors={colors}>
        <ShimmerBlock colors={colors} style={skeletonStyles.sectionIcon} />
        <ShimmerBlock colors={colors} style={skeletonStyles.sectionTitle} />
        <ShimmerBlock colors={colors} style={skeletonStyles.bodyLine} />
        <ShimmerBlock colors={colors} style={skeletonStyles.bodyLineShort} />
        <SkeletonCard colors={colors} style={skeletonStyles.innerStatCard}>
          <ShimmerBlock colors={colors} style={skeletonStyles.sectionEyebrow} />
          <ShimmerBlock colors={colors} style={skeletonStyles.metricValue} />
        </SkeletonCard>
        <ShimmerBlock colors={colors} style={skeletonStyles.actionButton} />
      </SkeletonCard>

      <SkeletonCard colors={colors}>
        <View style={skeletonStyles.rowBetween}>
          <ShimmerBlock colors={colors} style={skeletonStyles.sectionTitle} />
          <ShimmerBlock colors={colors} style={skeletonStyles.metaLine} />
        </View>
        <View style={skeletonStyles.listStack}>
          {Array.from({ length: 3 }).map((_, index) => (
            <View key={index} style={skeletonStyles.listRow}>
              <View style={skeletonStyles.listRowLeft}>
                <ShimmerBlock colors={colors} style={skeletonStyles.rowIcon} />
                <View style={skeletonStyles.fill}>
                  <ShimmerBlock colors={colors} style={skeletonStyles.rowTitle} />
                  <ShimmerBlock colors={colors} style={skeletonStyles.rowMetaWide} />
                </View>
              </View>
              <View style={skeletonStyles.rowRight}>
                <ShimmerBlock colors={colors} style={skeletonStyles.rowAmount} />
                <ShimmerBlock colors={colors} style={skeletonStyles.rowChip} />
              </View>
            </View>
          ))}
        </View>
      </SkeletonCard>
    </>
  );
}

export function ActivitySkeleton({ colors }: { colors: AppColorTheme }) {
  return (
    <>
      <SkeletonCard colors={colors}>
        <View style={skeletonStyles.rowBetween}>
          <View style={skeletonStyles.fill}>
            <ShimmerBlock colors={colors} style={skeletonStyles.sectionEyebrow} />
            <ShimmerBlock colors={colors} style={skeletonStyles.bodyLine} />
          </View>
          <ShimmerBlock colors={colors} style={skeletonStyles.metaLine} />
        </View>
        <View style={skeletonStyles.filterRow}>
          <ShimmerBlock colors={colors} style={skeletonStyles.filterChipWide} />
          <ShimmerBlock colors={colors} style={skeletonStyles.filterChip} />
          <ShimmerBlock colors={colors} style={skeletonStyles.filterChip} />
        </View>
      </SkeletonCard>

      <MetricGrid colors={colors} count={3} />

      <View style={skeletonStyles.groupSection}>
        <View style={skeletonStyles.rowBetween}>
          <ShimmerBlock colors={colors} style={skeletonStyles.sectionTitle} />
          <ShimmerBlock colors={colors} style={skeletonStyles.groupLine} />
        </View>
        <View style={skeletonStyles.listStack}>
          {Array.from({ length: 4 }).map((_, index) => (
            <SkeletonCard key={index} colors={colors} style={skeletonStyles.transactionCard}>
              <View style={skeletonStyles.listRow}>
                <View style={skeletonStyles.listRowLeft}>
                  <ShimmerBlock colors={colors} style={skeletonStyles.rowIcon} />
                  <View style={skeletonStyles.fill}>
                    <ShimmerBlock colors={colors} style={skeletonStyles.rowTitle} />
                    <ShimmerBlock colors={colors} style={skeletonStyles.rowMetaWide} />
                  </View>
                </View>
                <View style={skeletonStyles.rowRight}>
                  <ShimmerBlock colors={colors} style={skeletonStyles.rowAmount} />
                  <ShimmerBlock colors={colors} style={skeletonStyles.rowChip} />
                </View>
              </View>
            </SkeletonCard>
          ))}
        </View>
      </View>
    </>
  );
}

export function ReportsSkeleton({ colors }: { colors: AppColorTheme }) {
  return (
    <>
      <HeroSkeleton colors={colors}>
        <View style={skeletonStyles.rowBetween}>
          <ShimmerBlock colors={colors} tone="inverse" style={skeletonStyles.heroChip} />
          <ShimmerBlock colors={colors} tone="inverse" style={skeletonStyles.heroKickerSmall} />
        </View>
        <ShimmerBlock colors={colors} tone="inverse" style={skeletonStyles.heroValueLarge} />
        <View style={skeletonStyles.filterRow}>
          <ShimmerBlock colors={colors} tone="inverse" style={skeletonStyles.heroChip} />
          <ShimmerBlock colors={colors} tone="inverse" style={skeletonStyles.heroChip} />
        </View>
        <ShimmerBlock colors={colors} tone="inverse" style={skeletonStyles.bodyLine} />
        <ShimmerBlock colors={colors} tone="inverse" style={skeletonStyles.bodyLineShort} />
      </HeroSkeleton>

      <MetricGrid colors={colors} />

      <SkeletonCard colors={colors}>
        <View style={skeletonStyles.rowBetween}>
          <View style={skeletonStyles.fill}>
            <ShimmerBlock colors={colors} style={skeletonStyles.sectionEyebrow} />
            <ShimmerBlock colors={colors} style={skeletonStyles.sectionTitle} />
          </View>
          <ShimmerBlock colors={colors} style={skeletonStyles.heroChip} />
        </View>
        <View style={skeletonStyles.listStack}>
          {Array.from({ length: 4 }).map((_, index) => (
            <View key={index} style={skeletonStyles.categoryItem}>
              <View style={skeletonStyles.rowBetween}>
                <ShimmerBlock colors={colors} style={skeletonStyles.rowTitle} />
                <ShimmerBlock colors={colors} style={skeletonStyles.metaLine} />
              </View>
              <ShimmerBlock colors={colors} style={skeletonStyles.progressBar} />
              <ShimmerBlock colors={colors} style={skeletonStyles.chartLabel} />
            </View>
          ))}
        </View>
      </SkeletonCard>

      <SkeletonCard colors={colors}>
        <View style={skeletonStyles.rowBetween}>
          <View style={skeletonStyles.fill}>
            <ShimmerBlock colors={colors} style={skeletonStyles.sectionEyebrow} />
            <ShimmerBlock colors={colors} style={skeletonStyles.sectionTitle} />
          </View>
          <ShimmerBlock colors={colors} style={skeletonStyles.segmentedControl} />
        </View>
        <View style={skeletonStyles.chartRowTall}>
          {Array.from({ length: 6 }).map((_, index) => (
            <View key={index} style={skeletonStyles.chartItem}>
              <ShimmerBlock
                colors={colors}
                style={[
                  skeletonStyles.chartBar,
                  {
                    height: 58 + ((index % 3) + 1) * 20,
                  },
                ]}
              />
              <ShimmerBlock colors={colors} style={skeletonStyles.chartLabel} />
            </View>
          ))}
        </View>
      </SkeletonCard>

      <SkeletonCard colors={colors}>
        <ShimmerBlock colors={colors} style={skeletonStyles.sectionEyebrow} />
        <ShimmerBlock colors={colors} style={skeletonStyles.sectionTitle} />
        <ShimmerBlock colors={colors} style={skeletonStyles.bodyLine} />
        <ShimmerBlock colors={colors} style={skeletonStyles.bodyLineShort} />
        <View style={skeletonStyles.insightRow}>
          <SkeletonCard colors={colors} style={skeletonStyles.insightStatCard}>
            <ShimmerBlock colors={colors} style={skeletonStyles.rowTitle} />
            <ShimmerBlock colors={colors} style={skeletonStyles.metricValue} />
          </SkeletonCard>
          <SkeletonCard colors={colors} style={skeletonStyles.insightStatCard}>
            <ShimmerBlock colors={colors} style={skeletonStyles.rowTitle} />
            <ShimmerBlock colors={colors} style={skeletonStyles.metricValue} />
          </SkeletonCard>
        </View>
      </SkeletonCard>
    </>
  );
}

export function DebtSkeleton({ colors }: { colors: AppColorTheme }) {
  return (
    <>
      <HeroSkeleton colors={colors}>
        <ShimmerBlock colors={colors} tone="inverse" style={skeletonStyles.heroKicker} />
        <ShimmerBlock colors={colors} tone="inverse" style={skeletonStyles.bodyLine} />
        <ShimmerBlock colors={colors} tone="inverse" style={skeletonStyles.heroValueLarge} />
        <View style={skeletonStyles.heroRow}>
          <ShimmerBlock colors={colors} tone="inverse" style={skeletonStyles.metaLine} />
          <ShimmerBlock colors={colors} tone="inverse" style={skeletonStyles.metaLine} />
          <ShimmerBlock colors={colors} tone="inverse" style={skeletonStyles.metaLine} />
        </View>
        <View style={skeletonStyles.filterRow}>
          <ShimmerBlock colors={colors} tone="inverse" style={skeletonStyles.actionButton} />
          <ShimmerBlock colors={colors} tone="inverse" style={skeletonStyles.actionButton} />
        </View>
      </HeroSkeleton>

      <MetricGrid colors={colors} />

      <SkeletonCard colors={colors}>
        <View style={skeletonStyles.rowBetween}>
          <View style={skeletonStyles.fill}>
            <ShimmerBlock colors={colors} style={skeletonStyles.sectionEyebrow} />
            <ShimmerBlock colors={colors} style={skeletonStyles.sectionTitle} />
          </View>
          <ShimmerBlock colors={colors} style={skeletonStyles.metaLine} />
        </View>
        <View style={skeletonStyles.listStack}>
          {Array.from({ length: 3 }).map((_, index) => (
            <SkeletonCard key={index} colors={colors} style={skeletonStyles.transactionCard}>
              <View style={skeletonStyles.rowBetween}>
                <View style={skeletonStyles.fill}>
                  <View style={skeletonStyles.rowBetween}>
                    <ShimmerBlock colors={colors} style={skeletonStyles.rowTitle} />
                    <ShimmerBlock colors={colors} style={skeletonStyles.rowChip} />
                  </View>
                  <ShimmerBlock colors={colors} style={skeletonStyles.rowMetaWide} />
                </View>
                <ShimmerBlock colors={colors} style={skeletonStyles.rowAmount} />
              </View>
              <ShimmerBlock colors={colors} style={skeletonStyles.progressBar} />
              <View style={skeletonStyles.rowBetween}>
                <ShimmerBlock colors={colors} style={skeletonStyles.chartLabel} />
                <ShimmerBlock colors={colors} style={skeletonStyles.chartLabel} />
              </View>
            </SkeletonCard>
          ))}
        </View>
      </SkeletonCard>

      <SkeletonCard colors={colors}>
        <View style={skeletonStyles.listRow}>
          <ShimmerBlock colors={colors} style={skeletonStyles.rowIcon} />
          <View style={skeletonStyles.fill}>
            <ShimmerBlock colors={colors} style={skeletonStyles.sectionEyebrow} />
            <ShimmerBlock colors={colors} style={skeletonStyles.sectionTitle} />
            <ShimmerBlock colors={colors} style={skeletonStyles.rowMetaWide} />
          </View>
          <ShimmerBlock colors={colors} style={skeletonStyles.rowChip} />
        </View>
        <View style={skeletonStyles.filterRow}>
          <ShimmerBlock colors={colors} style={skeletonStyles.actionButton} />
          <ShimmerBlock colors={colors} style={skeletonStyles.actionButton} />
        </View>
        <View style={skeletonStyles.insightRow}>
          <SkeletonCard colors={colors} style={skeletonStyles.insightStatCard}>
            <ShimmerBlock colors={colors} style={skeletonStyles.rowTitle} />
            <ShimmerBlock colors={colors} style={skeletonStyles.metricValue} />
          </SkeletonCard>
          <SkeletonCard colors={colors} style={skeletonStyles.insightStatCard}>
            <ShimmerBlock colors={colors} style={skeletonStyles.rowTitle} />
            <ShimmerBlock colors={colors} style={skeletonStyles.metricValue} />
          </SkeletonCard>
        </View>
      </SkeletonCard>
    </>
  );
}

const skeletonStyles = StyleSheet.create({
  block: {
    borderRadius: 16,
    overflow: 'hidden',
  },
  glow: {
    position: 'absolute',
    top: -12,
    bottom: -12,
    width: 88,
    opacity: 0.9,
  },
  card: {
    borderRadius: 20,
    padding: 18,
    gap: 14,
    borderWidth: 1,
  },
  hero: {
    borderRadius: 24,
    padding: 18,
    gap: 14,
  },
  metricGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  metricCard: {
    width: '48%',
  },
  metricIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
  },
  metricLabel: {
    width: '58%',
    height: 12,
    borderRadius: 8,
  },
  metricValue: {
    width: '72%',
    height: 22,
    borderRadius: 10,
  },
  metricMeta: {
    width: '42%',
    height: 10,
    borderRadius: 8,
  },
  heroKicker: {
    width: '30%',
    height: 12,
    borderRadius: 999,
  },
  heroKickerSmall: {
    width: 76,
    height: 10,
    borderRadius: 999,
  },
  heroValue: {
    width: '72%',
    height: 46,
    borderRadius: 18,
  },
  heroValueLarge: {
    width: '78%',
    height: 54,
    borderRadius: 20,
  },
  heroRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 10,
  },
  heroChip: {
    width: 112,
    height: 32,
    borderRadius: 16,
  },
  heroHint: {
    width: 148,
    height: 12,
    borderRadius: 8,
  },
  sectionEyebrow: {
    width: '34%',
    height: 10,
    borderRadius: 8,
  },
  sectionTitle: {
    width: '54%',
    height: 22,
    borderRadius: 10,
  },
  sectionValue: {
    width: '62%',
    height: 28,
    borderRadius: 12,
  },
  sectionIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
  },
  progressBar: {
    width: '100%',
    height: 10,
    borderRadius: 999,
  },
  metaLine: {
    width: 84,
    height: 10,
    borderRadius: 8,
  },
  metaLineWide: {
    width: 132,
    height: 10,
    borderRadius: 8,
  },
  segmentedControl: {
    width: 132,
    height: 34,
    borderRadius: 14,
  },
  chartRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 10,
  },
  chartRowTall: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 12,
    minHeight: 190,
  },
  chartItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 10,
  },
  chartBar: {
    width: '80%',
    borderRadius: 14,
  },
  chartLabel: {
    width: '62%',
    height: 10,
    borderRadius: 8,
  },
  bodyLine: {
    width: '100%',
    height: 12,
    borderRadius: 8,
  },
  bodyLineShort: {
    width: '74%',
    height: 12,
    borderRadius: 8,
  },
  innerStatCard: {
    padding: 16,
    gap: 10,
  },
  actionButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: 16,
  },
  rowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  rowIcon: {
    width: 48,
    height: 48,
    borderRadius: 16,
  },
  rowTitle: {
    width: '62%',
    height: 14,
    borderRadius: 8,
  },
  rowMetaWide: {
    width: '88%',
    height: 10,
    borderRadius: 8,
  },
  rowAmount: {
    width: 90,
    height: 16,
    borderRadius: 8,
  },
  rowChip: {
    width: 70,
    height: 24,
    borderRadius: 12,
  },
  listStack: {
    gap: 12,
  },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 14,
  },
  listRowLeft: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  rowRight: {
    alignItems: 'flex-end',
    gap: 8,
  },
  insightRow: {
    flexDirection: 'row',
    gap: 12,
  },
  insightStatCard: {
    flex: 1,
    padding: 16,
  },
  fill: {
    flex: 1,
    minWidth: 0,
    gap: 10,
  },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  filterChipWide: {
    width: 120,
    height: 30,
    borderRadius: 999,
  },
  filterChip: {
    width: 84,
    height: 30,
    borderRadius: 999,
  },
  groupSection: {
    gap: 14,
  },
  groupLine: {
    flex: 1,
    height: 1,
    maxWidth: 120,
    borderRadius: 999,
  },
  transactionCard: {
    padding: 18,
    gap: 14,
  },
  categoryItem: {
    gap: 10,
  },
});
