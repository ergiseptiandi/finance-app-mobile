import { Text, View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Stop } from 'react-native-svg';

type BudgetRingProps = {
  accent: string;
  label: string;
  progress: number;
  size?: number;
  value: string;
  valueLabel: string;
  textColor: string;
  trackColor: string;
};

export function BudgetRing({
  accent,
  label,
  progress,
  size = 118,
  value,
  valueLabel,
  textColor,
  trackColor,
}: BudgetRingProps) {
  const strokeWidth = 11;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const normalizedProgress = clampPercent(progress);
  const strokeDashoffset = circumference * (1 - normalizedProgress / 100);

  return (
    <View style={{ alignItems: 'center', justifyContent: 'center', width: size, height: size }}>
      <Svg width={size} height={size}>
        <Defs>
          <LinearGradient id="budget-ring-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <Stop offset="0%" stopColor={accent} stopOpacity={0.92} />
            <Stop offset="100%" stopColor={accent} stopOpacity={0.72} />
          </LinearGradient>
        </Defs>
        <Circle cx={size / 2} cy={size / 2} r={radius} stroke={trackColor} strokeWidth={strokeWidth} fill="none" />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="url(#budget-ring-gradient)"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={strokeDashoffset}
          rotation="-90"
          originX={size / 2}
          originY={size / 2}
        />
      </Svg>
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          inset: 0,
          alignItems: 'center',
          justifyContent: 'center',
          gap: 2,
        }}>
        <Text
          numberOfLines={1}
          style={{
            color: textColor,
            fontSize: 10,
            fontWeight: '800',
            letterSpacing: 1,
            textTransform: 'uppercase',
          }}>
          {label}
        </Text>
        <Text
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.7}
          style={{
            color: textColor,
            fontSize: 20,
            lineHeight: 24,
            fontWeight: '900',
            letterSpacing: -0.8,
          }}>
          {value}
        </Text>
        <Text
          numberOfLines={1}
          style={{
            color: textColor,
            fontSize: 12,
            fontWeight: '700',
            opacity: 0.8,
          }}>
          {valueLabel}
        </Text>
      </View>
    </View>
  );
}

const clampPercent = (value: number) => Math.max(0, Math.min(100, value));
