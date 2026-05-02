import { MaterialCommunityIcons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';

import { alpha, type AppColorTheme } from '@/constants/theme';

type AIMessageProps = {
  role: 'user' | 'assistant';
  content: string;
  colors: AppColorTheme;
};

export function AIMessage({ role, content, colors }: AIMessageProps) {
  const isUser = role === 'user';
  const styles = createStyles(colors, isUser);

  return (
    <View style={styles.wrapper}>
      {!isUser ? (
        <View style={styles.avatar}>
          <MaterialCommunityIcons name="lightning-bolt-outline" size={16} color={colors.primary} />
        </View>
      ) : null}
      <View style={styles.bubble}>
        <Text style={styles.text}>{content}</Text>
      </View>
      {isUser ? (
        <View style={styles.avatar}>
          <MaterialCommunityIcons name="account" size={16} color={colors.onPrimary} />
        </View>
      ) : null}
    </View>
  );
}

const createStyles = (colors: AppColorTheme, isUser: boolean) =>
  StyleSheet.create({
    wrapper: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      gap: 8,
      justifyContent: isUser ? 'flex-end' : 'flex-start',
      marginBottom: 12,
    },
    avatar: {
      width: 28,
      height: 28,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: isUser ? colors.primary : alpha(colors.primary, 0.1),
    },
    bubble: {
      maxWidth: '78%',
      borderRadius: 18,
      borderBottomRightRadius: isUser ? 4 : 18,
      borderBottomLeftRadius: isUser ? 18 : 4,
      paddingHorizontal: 14,
      paddingVertical: 10,
      backgroundColor: isUser ? colors.primary : colors.shellCard,
      borderWidth: isUser ? 0 : 1,
      borderColor: isUser ? 'transparent' : colors.shellBorder,
    },
    text: {
      color: isUser ? colors.onPrimary : colors.shellTextPrimary,
      fontSize: 14,
      lineHeight: 20,
      fontWeight: '500',
    },
  });
