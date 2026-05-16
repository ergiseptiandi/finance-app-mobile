import { StyleSheet, View } from 'react-native';

import { ShimmerBlock } from '@/components/ui/skeleton';
import type { AppColorTheme } from '@/constants/theme';

type BillingSummarySkeletonProps = {
    colors: AppColorTheme;
};

export function BillingSummarySkeleton({ colors }: BillingSummarySkeletonProps) {
    return (
        <View
            style={[
                styles.card,
                {
                    backgroundColor: colors.shellCard,
                    borderColor: colors.shellBorder,
                },
            ]}>
            <View style={styles.row}>
                <View style={styles.column}>
                    <ShimmerBlock colors={colors} style={styles.label} />
                    <ShimmerBlock colors={colors} style={styles.value} />
                </View>
                <View style={styles.column}>
                    <ShimmerBlock colors={colors} style={styles.label} />
                    <ShimmerBlock colors={colors} style={styles.value} />
                </View>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    card: {
        borderRadius: 28,
        paddingHorizontal: 18,
        paddingVertical: 16,
        borderWidth: 1,
    },
    row: {
        flexDirection: 'row',
        gap: 12,
    },
    column: {
        flex: 1,
        gap: 10,
    },
    label: {
        width: '60%',
        height: 11,
        borderRadius: 8,
    },
    value: {
        width: '80%',
        height: 22,
        borderRadius: 10,
    },
});
