import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AIMessage } from '@/components/ai/ai-message';
import { SuggestionCard, type SuggestionItem } from '@/components/ai/suggestion-card';
import { Colors, alpha, type AppColorTheme } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { sendChatMessage, getChatUsage } from '@/lib/api/ai';
import { getAuthSession } from '@/lib/auth-session';
import { useAppLanguage } from '@/providers/language-provider';

type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
};

type SuggestionSection = {
  key: string;
  label: string;
  items: SuggestionItem[];
};

export default function AIAnalystScreen() {
  const colorScheme = useColorScheme() ?? 'light';
  const isDark = colorScheme === 'dark';
  const colors = Colors[colorScheme];
  const { language, t } = useAppLanguage();
  const insets = useSafeAreaInsets();
  const styles = createStyles(colors, insets.top, insets.bottom);
  const flatListRef = useRef<FlatList<ChatMessage | SuggestionSection>>(null);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [chatCount, setChatCount] = useState(0);
  const [maxChats, setMaxChats] = useState(100);

  const showSuggestions = messages.length === 0;

  const suggestionSections: SuggestionSection[] = [
    {
      key: 'health',
      label: language === 'id' ? 'Kesehatan Keuangan' : 'Financial Health',
      items: [
        { icon: 'heart-pulse', label: language === 'id' ? 'Gimana kondisi keuangan saya?' : 'How is my financial health?', color: colors.primary },
        { icon: 'trending-up', label: language === 'id' ? 'Apa tren keuangan saya?' : 'What are my financial trends?', color: colors.secondary },
        { icon: 'fire', label: language === 'id' ? 'Apakah saya boros?' : 'Am I overspending?', color: colors.warning },
      ],
    },
    {
      key: 'advice',
      label: language === 'id' ? 'Saran & Tips' : 'Advice & Tips',
      items: [
        { icon: 'piggy-bank', label: language === 'id' ? 'Gimana cara hemat?' : 'How can I save more?', color: colors.secondary },
        { icon: 'wallet-outline', label: language === 'id' ? 'Rekomendasi budget' : 'Budget recommendations', color: colors.primary },
        { icon: 'bank-transfer', label: language === 'id' ? 'Analisis utang saya' : 'Analyze my debt', color: colors.warning },
      ],
    },
    {
      key: 'insights',
      label: language === 'id' ? 'Wawasan' : 'Insights',
      items: [
        { icon: 'chart-bar', label: language === 'id' ? 'Tren pengeluaran bulan ini' : 'Spending trends this month', color: colors.secondary },
        { icon: 'lightbulb-outline', label: language === 'id' ? 'Tips keuangan mingguan' : 'Weekly financial tips', color: colors.primary },
        { icon: 'calendar-check', label: language === 'id' ? 'Target finansial saya' : 'My financial goals', color: colors.warning },
      ],
    },
  ];

  const loadUsage = useCallback(async () => {
    try {
      const session = await getAuthSession();
      if (!session) return;
      const usage = await getChatUsage(session.token.access_token);
      setChatCount(usage.chat_count);
      setMaxChats(usage.max_chats);
    } catch {}
  }, []);

  useEffect(() => { loadUsage(); }, [loadUsage]);

  const handleSend = useCallback(async (text?: string) => {
    const messageText = text || input;
    if (!messageText.trim() || loading) return;

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: messageText.trim(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setLoading(true);

    try {
      const session = await getAuthSession();
      if (!session) {
        router.replace('/login');
        return;
      }
      const result = await sendChatMessage(session.token.access_token, userMessage.content);
      const aiMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: result.reply,
      };
      setMessages((prev) => [...prev, aiMessage]);
      setChatCount((c) => c + 1);
    } catch (err) {
      const serverMsg = err instanceof Error ? err.message : '';
      const errorMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: serverMsg || (language === 'id'
          ? 'Maaf, gagal mendapatkan analisis. Coba lagi nanti.'
          : 'Sorry, failed to get analysis. Please try again.'),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setLoading(false);
    }
  }, [input, loading, language]);

  const isSuggestion = (item: ChatMessage | SuggestionSection): item is SuggestionSection =>
    'key' in item && 'items' in item;

  const allItems: (ChatMessage | SuggestionSection)[] = showSuggestions
    ? suggestionSections
    : messages;

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.headerIcon}>
            <MaterialCommunityIcons name="lightning-bolt-outline" size={20} color={colors.onPrimary} />
          </View>
          <View>
            <Text style={styles.headerTitle}>{language === 'id' ? 'AI Analis' : 'AI Analyst'}</Text>
            <Text style={styles.headerMeta}>
              {language === 'id' ? `${chatCount}/${maxChats} chat` : `${chatCount}/${maxChats} chats`}
            </Text>
          </View>
        </View>
        <Pressable onPress={() => router.back()} style={styles.closeButton} accessibilityRole="button" accessibilityLabel={t('common.cancel')}>
          <MaterialCommunityIcons name="close" size={22} color={colors.shellTextPrimary} />
        </Pressable>
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 88 : 0}>
        <FlatList
          ref={flatListRef}
          data={allItems}
          keyExtractor={(item) => (isSuggestion(item) ? item.key : item.id)}
          contentContainerStyle={styles.listContent}
          onContentSizeChange={() => !showSuggestions && flatListRef.current?.scrollToEnd()}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => {
            if (isSuggestion(item)) {
              return <View style={styles.suggestionBlock}>
                <SuggestionCard label={item.label} items={item.items} onSelect={(label) => handleSend(label)} colors={colors} />
              </View>;
            }
            return <AIMessage role={item.role} content={item.content} colors={colors} />;
          }}
          ListFooterComponent={loading ? <View style={styles.typingIndicator}>
            <View style={[styles.typingAvatar, { backgroundColor: alpha(colors.primary, 0.1) }]}>
              <MaterialCommunityIcons name="lightning-bolt-outline" size={14} color={colors.primary} />
            </View>
            <View style={styles.typingBubble}>
              <ActivityIndicator size="small" color={colors.primary} />
            </View>
          </View> : null}
        />

        <View style={styles.inputBar}>
          <TextInput
            value={input}
            onChangeText={setInput}
            placeholder={language === 'id' ? 'Tanya AI Analis...' : 'Ask AI Analyst...'}
            placeholderTextColor={colors.shellTextMuted}
            style={styles.input}
            multiline
            maxLength={500}
            returnKeyType="send"
            onSubmitEditing={() => handleSend()}
          />
          <Pressable
            onPress={() => handleSend()}
            disabled={!input.trim() || loading}
            accessibilityRole="button"
            accessibilityLabel={language === 'id' ? 'Kirim' : 'Send'}
            style={[styles.sendButton, (!input.trim() || loading) && styles.sendButtonDisabled]}>
            {loading ? (
              <ActivityIndicator size="small" color={colors.onPrimary} />
            ) : (
              <MaterialCommunityIcons name="send" size={18} color={colors.onPrimary} />
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const createStyles = (colors: AppColorTheme, topInset: number, bottomInset: number) =>
  StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: colors.shellBackground,
    },
    flex: {
      flex: 1,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingTop: Math.max(topInset + 8, 24),
      paddingHorizontal: 16,
      paddingBottom: 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.shellBorder,
      backgroundColor: colors.shellCard,
    },
    headerLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    headerIcon: {
      width: 36,
      height: 36,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.primary,
    },
    headerTitle: {
      color: colors.shellTextPrimary,
      fontSize: 17,
      fontWeight: '800',
    },
    headerMeta: {
      color: colors.shellTextMuted,
      fontSize: 11,
      fontWeight: '600',
      marginTop: 1,
    },
    closeButton: {
      width: 36,
      height: 36,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.shellCardSoft,
    },
    listContent: {
      padding: 16,
      paddingBottom: 8,
      flexGrow: 1,
    },
    suggestionBlock: {
      marginBottom: 20,
    },
    typingIndicator: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      gap: 8,
      marginBottom: 12,
    },
    typingAvatar: {
      width: 28,
      height: 28,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
    },
    typingBubble: {
      borderRadius: 18,
      borderBottomLeftRadius: 4,
      paddingHorizontal: 16,
      paddingVertical: 12,
      backgroundColor: colors.shellCard,
      borderWidth: 1,
      borderColor: colors.shellBorder,
    },
    inputBar: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      gap: 8,
      paddingHorizontal: 12,
      paddingVertical: 8,
      paddingBottom: Math.max(bottomInset + 8, 12),
      borderTopWidth: 1,
      borderTopColor: colors.shellBorder,
      backgroundColor: colors.shellCard,
    },
    input: {
      flex: 1,
      minHeight: 40,
      maxHeight: 100,
      borderRadius: 20,
      paddingHorizontal: 14,
      paddingVertical: 8,
      backgroundColor: colors.shellCardSoft,
      color: colors.shellTextPrimary,
      fontSize: 14,
      fontWeight: '500',
      borderWidth: 1,
      borderColor: colors.shellBorder,
    },
    sendButton: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.primary,
    },
    sendButtonDisabled: {
      opacity: 0.5,
    },
  });
