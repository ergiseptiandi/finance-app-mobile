import { useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { BillingSummarySkeleton } from '@/components/debt/billing-summary-skeleton';
import type { AppColorTheme } from '@/constants/theme';
import type { InstallmentRecord } from '@/lib/api/debts';
import { calculateBillingSummary, type BillingSummaryResult } from '@/lib/billing-summary';

type BillingSummaryCardProps = {
    installments: InstallmentRecord[];
    loading: boolean;
    error: boolean;
    locale: string;
    language: string;
    t: (key: string, params?: Record<string, string | number>) => string;
    colors: AppColorTheme;
};

const formatCurrency = (value: number): string =>
    new Intl.NumberFormat('id-ID', {
        style: 'currency',
        currency: 'IDR',
        maximumFractionDigits: 0,
    }).format(value);

const formatMonthLabel = (yearMonth: string, locale: string): string => {
    const [year, month] = yearMonth.split('-').map(Number);
    const date = new Date(year, month - 1, 1);
    return new Intl.DateTimeFormat(locale, {
        month: 'long',
        year: 'numeric',
    }).format(date);
};

export function BillingSummaryCard({
    installments,
    loading,
    error,
    locale,
    language,
    t,
    colors,
}: BillingSummaryCardProps) {
    const previousDataRef = useRef<BillingSummaryResult | null>(null);

    // Calculate summary from current installments
    const summary =
        installments.length > 0
            ? calculateBillingSummary(installments, new Date())
            : null;

    // Update stale data reference when we have valid data
    if (summary) {
        previousDataRef.current = summary;
    }

    const hasPreviousData = previousDataRef.current !== null;

    // Show skeleton when loading and no previous data exists
    if (loading && !hasPreviousData) {
        return <BillingSummarySkeleton colors={colors} />;
    }

    // Determine display values
    let displayData: BillingSummaryResult;

    if (summary) {
        // Fresh data available
        displayData = summary;
    } else if (loading && hasPreviousData) {
        // Refresh in progress — retain stale values
        displayData = previousDataRef.current!;
    } else if (error && !hasPreviousData) {
        // Error with no previous data — show zeros
        displayData = {
            currentMonthTotal: 0,
            nextMonthTotal: 0,
            currentMonthLabel: calculateBillingSummary([], new Date()).currentMonthLabel,
            nextMonthLabel: calculateBillingSummary([], new Date()).nextMonthLabel,
        };
    } else if (hasPreviousData) {
        // Fallback to previous data (e.g., error during refresh)
        displayData = previousDataRef.current!;
    } else {
        // No data at all — show zeros
        displayData = calculateBillingSummary([], new Date());
    }

    const currentMonthFormatted = formatCurrency(displayData.currentMonthTotal);
    const nextMonthFormatted = formatCurrency(displayData.nextMonthTotal);
    const currentMonthLabel = formatMonthLabel(displayData.currentMonthLabel, locale);
    const nextMonthLabel = formatMonthLabel(displayData.nextMonthLabel, locale);

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
                    <Text
                        style={[
                            styles.monthLabel,
                            { color: colors.shellTextMuted },
                        ]}>
                        {currentMonthLabel.toUpperCase()}
                    </Text>
                    <Text
                        style={[
                            styles.currencyValue,
                            { color: colors.shellTextPrimary },
                        ]}
                        numberOfLines={1}
                        adjustsFontSizeToFit>
                        {currentMonthFormatted}
                    </Text>
                </View>
                <View style={styles.column}>
                    <Text
                        style={[
                            styles.monthLabel,
                            { color: colors.shellTextMuted },
                        ]}>
                        {nextMonthLabel.toUpperCase()}
                    </Text>
                    <Text
                        style={[
                            styles.currencyValue,
                            { color: colors.shellTextPrimary },
                        ]}
                        numberOfLines={1}
                        adjustsFontSizeToFit>
                        {nextMonthFormatted}
                    </Text>
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
    monthLabel: {
        fontSize: 11,
        fontWeight: '600',
        letterSpacing: 0.8,
    },
    currencyValue: {
        fontSize: 20,
        fontWeight: '900',
        letterSpacing: -0.8,
    },
});
