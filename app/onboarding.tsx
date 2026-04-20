import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useMemo, useRef, useState } from 'react';
import {
  FlatList,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';

import { alpha, Colors, type AppColorTheme } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useAppLanguage } from '@/providers/language-provider';
import { setOnboardingCompleted } from '@/lib/onboarding';
import type { AppLanguage } from '@/constants/i18n';
import type { ImageSourcePropType } from 'react-native';

type OnboardingSlide = {
  key: string;
  title: string;
  body: string;
  image: ImageSourcePropType;
};

const slideAssets = [
  require('../assets/images/view1.png'),
  require('../assets/images/view2.png'),
  require('../assets/images/view3.png'),
];

const createSlides = (language: AppLanguage): OnboardingSlide[] => {
  if (language === 'id') {
    return [
      {
        key: '1',
        title: 'Kuasai Uang Anda',
        body: 'Lacak setiap rupiah, kelola utang, dan tumbuhkan kekayaan dengan mudah.',
        image: slideAssets[0],
      },
      {
        key: '2',
        title: 'Multi-Wallet',
        body: 'Sambungkan rekening bank, dompet digital seperti GoPay, dan kelola semua saldo di satu tempat.',
        image: slideAssets[1],
      },
      {
        key: '3',
        title: 'Wawasan Sekilas',
        body: 'Laporan yang kuat dan peringatan pintar membantu Anda tetap terarah pada masa depan finansial.',
        image: slideAssets[2],
      },
    ];
  }

  return [
    {
      key: '1',
      title: 'Master Your Money',
      body: 'Track every penny, manage your debt, and watch your wealth grow with ease.',
      image: slideAssets[0],
    },
    {
      key: '2',
      title: 'Multi-Wallet',
      body: 'Link your bank accounts, digital wallets like GoPay, and manage all your balances in one place.',
      image: slideAssets[1],
    },
    {
      key: '3',
      title: 'Insights at a Glance',
      body: 'Powerful reports and smart alerts keep you informed and in control of your financial future.',
      image: slideAssets[2],
    },
  ];
};

export default function OnboardingScreen() {
  const { width } = useWindowDimensions();
  const compact = width < 390;
  const previewHorizontalInset = compact ? 16 : 20;
  const slideWidth = Math.min(width - previewHorizontalInset * 2, 760);
  const colorScheme = useColorScheme() ?? 'light';
  const colors = Colors[colorScheme];
  const { language, setLanguage, t } = useAppLanguage();
  const styles = createStyles(colors, width);
  const slides = useMemo(() => createSlides(language), [language]);
  const [phase, setPhase] = useState<'language' | 'preview'>('language');
  const [activeIndex, setActiveIndex] = useState(0);
  const listRef = useRef<FlatList<OnboardingSlide>>(null);
  const localeAccent = language === 'id' ? colors.secondary : colors.warning;

  const selectLanguage = async (nextLanguage: AppLanguage) => {
    await setLanguage(nextLanguage);
  };

  const continueToPreview = () => {
    setPhase('preview');
    setTimeout(() => {
      listRef.current?.scrollToIndex({ index: 0, animated: false });
      setActiveIndex(0);
    }, 0);
  };

  const goToNextSlide = () => {
    if (activeIndex < slides.length - 1) {
      listRef.current?.scrollToIndex({ index: activeIndex + 1, animated: true });
      return;
    }

    void finishOnboarding();
  };

  const finishOnboarding = async () => {
    await setOnboardingCompleted();
    router.replace('/');
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.screen}>
        <View style={styles.glowTop} />
        <View style={styles.glowBottom} />

        {phase === 'language' ? (
          <View style={styles.languageStage}>
            <View style={styles.brandRow}>
              <Image
                source={require('../assets/images/logo.png')}
                style={styles.logo}
                contentFit="contain"
              />
              <View style={styles.brandCopy}>
                <Text style={styles.brandKicker}>{t('onboarding.brandKicker')}</Text>
                <Text style={styles.brandTitle}>{t('onboarding.title')}</Text>
              </View>
            </View>

            <View style={styles.heroCard}>
              <Text style={styles.heroBadge}>{t('onboarding.heroBadge')}</Text>
              <Text style={styles.heroTitle}>{t('onboarding.selectLanguageTitle')}</Text>
              <Text style={styles.heroBody}>{t('onboarding.selectLanguageBody')}</Text>
            </View>

            <View style={styles.languageGrid}>
              <Pressable
                onPress={() => void selectLanguage('id')}
                style={[
                  styles.languageCard,
                  language === 'id' && styles.languageCardActive,
                ]}>
                <View style={[styles.flagShell, language === 'id' && styles.flagShellActive]}>
                  <IdFlag />
                </View>
                <View style={styles.languageCardCopy}>
                  <Text style={styles.languageName}>{t('onboarding.languageIndonesian')}</Text>
                  <Text style={styles.languageMeta}>{t('onboarding.languageIndonesianMeta')}</Text>
                </View>
                {language === 'id' ? (
                  <MaterialCommunityIcons name="check-circle" size={20} color={localeAccent} />
                ) : null}
              </Pressable>

              <Pressable
                onPress={() => void selectLanguage('en-US')}
                style={[
                  styles.languageCard,
                  language === 'en-US' && styles.languageCardActive,
                ]}>
                <View style={[styles.flagShell, language === 'en-US' && styles.flagShellActive]}>
                  <EnFlag />
                </View>
                <View style={styles.languageCardCopy}>
                  <Text style={styles.languageName}>{t('onboarding.languageEnglish')}</Text>
                  <Text style={styles.languageMeta}>{t('onboarding.languageEnglishMeta')}</Text>
                </View>
                {language === 'en-US' ? (
                  <MaterialCommunityIcons name="check-circle" size={20} color={localeAccent} />
                ) : null}
              </Pressable>
            </View>

            <View style={styles.languageFooter}>
              <Text style={styles.languageHint}>{t('onboarding.languageHint')}</Text>
              <Pressable onPress={continueToPreview} style={styles.primaryButton}>
                <Text style={styles.primaryButtonText}>{t('onboarding.continue')}</Text>
                <MaterialCommunityIcons name="arrow-right" size={18} color={colors.onPrimary} />
              </Pressable>
            </View>
          </View>
        ) : (
          <View style={styles.previewStage}>
            <View style={styles.previewHeader}>
              <View style={styles.previewHeaderCopy}>
                <Text style={styles.brandKicker}>{t('onboarding.previewBadge')}</Text>
                <Text style={styles.brandTitle}>{t('onboarding.previewTitle')}</Text>
                <Text style={styles.previewSubtitle}>{t('onboarding.previewSubtitle')}</Text>
              </View>
              <Pressable onPress={() => setPhase('language')} style={styles.previewLanguagePill}>
                <MaterialCommunityIcons name="earth" size={16} color={localeAccent} />
                <Text style={styles.previewLanguageText}>{t('onboarding.changeLanguage')}</Text>
              </Pressable>
            </View>

            <FlatList
              ref={listRef}
              data={slides}
              keyExtractor={(item) => item.key}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              snapToAlignment="center"
              decelerationRate="fast"
              contentContainerStyle={styles.previewList}
              getItemLayout={(_, index) => ({
                length: slideWidth,
                offset: slideWidth * index,
                index,
              })}
              onMomentumScrollEnd={(event) => {
                const nextIndex = Math.round(event.nativeEvent.contentOffset.x / slideWidth);
                setActiveIndex(nextIndex);
              }}
              renderItem={({ item, index }) => (
                <View style={[styles.slide, { width: slideWidth }]}>
                  <View style={styles.slideCard}>
                    <View style={styles.slideMediaShell}>
                      <View style={styles.slideMediaFrame}>
                        <Image source={item.image} style={styles.slideImage} contentFit="contain" />
                        <View style={styles.slideIndexPill}>
                          <Text style={styles.slideIndexText}>
                            {String(index + 1).padStart(2, '0')} / {String(slides.length).padStart(2, '0')}
                          </Text>
                        </View>
                      </View>
                    </View>

                    <View style={styles.slideCopy}>
                      <View style={styles.slideCopyCard}>
                        <Text style={styles.slideTitle}>{item.title}</Text>
                        <Text style={styles.slideBody}>{item.body}</Text>
                      </View>
                    </View>
                  </View>
                </View>
              )}
            />

            <View style={styles.previewFooter}>
              <View style={styles.pagination}>
                {slides.map((slide, index) => (
                  <View
                    key={slide.key}
                    style={[styles.paginationDot, index === activeIndex && styles.paginationDotActive]}
                  />
                ))}
              </View>

              <View style={styles.previewActions}>
                <Pressable
                  onPress={() => {
                    if (activeIndex === 0) {
                      setPhase('language');
                      return;
                    }

                    listRef.current?.scrollToIndex({ index: activeIndex - 1, animated: true });
                  }}
                  style={styles.secondaryButton}>
                  <MaterialCommunityIcons name="chevron-left" size={18} color={colors.shellTextPrimary} />
                  <Text style={styles.secondaryButtonText}>{t('onboarding.back')}</Text>
                </Pressable>

                <Pressable onPress={goToNextSlide} style={[styles.primaryButton, styles.primaryButtonWide]}>
                  <Text style={styles.primaryButtonText}>
                    {activeIndex === slides.length - 1 ? t('onboarding.getStarted') : t('onboarding.next')}
                  </Text>
                  <MaterialCommunityIcons name="arrow-right" size={18} color={colors.onPrimary} />
                </Pressable>
              </View>
            </View>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

function IdFlag() {
  return (
    <View style={flagStyles.flag}>
      <View style={flagStyles.indonesiaTop} />
      <View style={flagStyles.indonesiaBottom} />
    </View>
  );
}

function EnFlag() {
  return (
    <View style={flagStyles.flag}>
      <View style={flagStyles.usBase}>
        <View style={flagStyles.usCanton}>
          <View style={flagStyles.starDotRow}>
            <View style={flagStyles.starDot} />
            <View style={flagStyles.starDot} />
            <View style={flagStyles.starDot} />
            <View style={flagStyles.starDot} />
          </View>
          <View style={flagStyles.starDotRow}>
            <View style={flagStyles.starDot} />
            <View style={flagStyles.starDot} />
            <View style={flagStyles.starDot} />
          </View>
          <View style={flagStyles.starDotRow}>
            <View style={flagStyles.starDot} />
            <View style={flagStyles.starDot} />
            <View style={flagStyles.starDot} />
            <View style={flagStyles.starDot} />
          </View>
          <View style={flagStyles.starDotRow}>
            <View style={flagStyles.starDot} />
            <View style={flagStyles.starDot} />
            <View style={flagStyles.starDot} />
          </View>
        </View>
        <View style={flagStyles.usStripe} />
        <View style={[flagStyles.usStripe, flagStyles.usStripeWhite]} />
        <View style={flagStyles.usStripe} />
        <View style={[flagStyles.usStripe, flagStyles.usStripeWhite]} />
        <View style={flagStyles.usStripe} />
        <View style={[flagStyles.usStripe, flagStyles.usStripeWhite]} />
        <View style={flagStyles.usStripe} />
        <View style={[flagStyles.usStripe, flagStyles.usStripeWhite]} />
        <View style={flagStyles.usStripe} />
      </View>
    </View>
  );
}

const flagStyles = StyleSheet.create({
  flag: {
    width: 44,
    height: 30,
    borderRadius: 9,
    overflow: 'hidden',
    backgroundColor: '#ffffff',
  },
  indonesiaTop: {
    flex: 1,
    backgroundColor: '#d62828',
  },
  indonesiaBottom: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  usBase: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  usCanton: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '46%',
    height: '56%',
    backgroundColor: '#2247a6',
    paddingHorizontal: 3,
    paddingVertical: 2,
    justifyContent: 'space-evenly',
    zIndex: 1,
  },
  starDotRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  starDot: {
    width: 2.5,
    height: 2.5,
    borderRadius: 99,
    backgroundColor: '#ffffff',
  },
  usStripe: {
    flex: 1,
    backgroundColor: '#b22234',
  },
  usStripeWhite: {
    backgroundColor: '#ffffff',
  },
});

const createStyles = (colors: AppColorTheme, width: number) => {
  const compact = width < 390;
  const isWide = width >= 768;

  return StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor: colors.background,
    },
    screen: {
      flex: 1,
      backgroundColor: colors.background,
      overflow: 'hidden',
    },
    glowTop: {
      position: 'absolute',
      top: -90,
      right: -90,
      width: 240,
      height: 240,
      borderRadius: 999,
      backgroundColor: alpha(colors.primary, 0.18),
    },
    glowBottom: {
      position: 'absolute',
      left: -120,
      bottom: -100,
      width: 280,
      height: 280,
      borderRadius: 999,
      backgroundColor: alpha(colors.secondary, 0.16),
    },
    languageStage: {
      flex: 1,
      paddingHorizontal: compact ? 18 : 22,
      paddingTop: 12,
      paddingBottom: 22,
      gap: 18,
      justifyContent: 'center',
      maxWidth: 760,
      alignSelf: 'center',
      width: '100%',
    },
    brandRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
    },
    logo: {
      width: 54,
      height: 54,
      borderRadius: 18,
      backgroundColor: colors.shellCard,
    },
    brandCopy: {
      flex: 1,
      minWidth: 0,
      gap: 4,
    },
    brandKicker: {
      color: colors.primary,
      fontSize: 11,
      fontWeight: '800',
      letterSpacing: 2,
      textTransform: 'uppercase',
    },
    brandTitle: {
      color: colors.shellTextPrimary,
      fontSize: compact ? 25 : 28,
      lineHeight: compact ? 30 : 34,
      fontWeight: '900',
      letterSpacing: -1,
    },
    heroCard: {
      borderRadius: 28,
      padding: compact ? 18 : 22,
      backgroundColor: colors.shellCard,
      borderWidth: 1,
      borderColor: colors.shellBorder,
      gap: 10,
      shadowColor: colors.ambientShadow,
      shadowOpacity: 0.12,
      shadowRadius: 24,
      shadowOffset: { width: 0, height: 16 },
      elevation: 2,
    },
    heroBadge: {
      alignSelf: 'flex-start',
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 6,
      backgroundColor: alpha(colors.primary, 0.08),
      color: colors.primary,
      fontSize: 10,
      fontWeight: '800',
      letterSpacing: 1,
      textTransform: 'uppercase',
    },
    heroTitle: {
      color: colors.shellTextPrimary,
      fontSize: compact ? 22 : 26,
      lineHeight: compact ? 28 : 32,
      fontWeight: '900',
      letterSpacing: -0.9,
    },
    heroBody: {
      color: colors.shellTextSecondary,
      fontSize: 14,
      lineHeight: 22,
      fontWeight: '500',
    },
    languageGrid: {
      gap: 12,
    },
    languageCard: {
      minHeight: 74,
      borderRadius: 24,
      paddingHorizontal: 16,
      paddingVertical: 14,
      backgroundColor: colors.shellCard,
      borderWidth: 1,
      borderColor: colors.shellBorder,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    languageCardActive: {
      borderColor: alpha(colors.primary, 0.34),
      backgroundColor: alpha(colors.primary, 0.08),
    },
    flagShell: {
      width: 54,
      height: 38,
      borderRadius: 12,
      padding: 2,
      backgroundColor: colors.shellCardMuted,
      borderWidth: 1,
      borderColor: colors.shellBorder,
      alignItems: 'center',
      justifyContent: 'center',
    },
    flagShellActive: {
      borderColor: alpha(colors.primary, 0.3),
      backgroundColor: colors.shellCard,
    },
    languageCardCopy: {
      flex: 1,
      minWidth: 0,
      gap: 2,
    },
    languageName: {
      color: colors.shellTextPrimary,
      fontSize: 16,
      lineHeight: 20,
      fontWeight: '800',
    },
    languageMeta: {
      color: colors.shellTextMuted,
      fontSize: 12,
      lineHeight: 16,
      fontWeight: '500',
    },
    languageFooter: {
      gap: 12,
      marginTop: 6,
    },
    languageHint: {
      color: colors.shellTextMuted,
      fontSize: 13,
      lineHeight: 20,
      fontWeight: '500',
      textAlign: 'center',
    },
    primaryButton: {
      minHeight: 52,
      borderRadius: 18,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'row',
      gap: 10,
    },
    primaryButtonWide: {
      flex: 1,
    },
    primaryButtonText: {
      color: colors.onPrimary,
      fontSize: 15,
      fontWeight: '800',
      letterSpacing: 0.2,
    },
    previewStage: {
      flex: 1,
      paddingHorizontal: compact ? 16 : 20,
      paddingTop: compact ? 60 : 76,
      paddingBottom: 18,
      maxWidth: 760,
      alignSelf: 'center',
      width: '100%',
    },
    previewHeader: {
      gap: 12,
      marginTop: 2,
      marginBottom: 18,
    },
    previewHeaderCopy: {
      gap: 6,
    },
    previewSubtitle: {
      color: colors.shellTextMuted,
      fontSize: 13,
      lineHeight: 20,
      fontWeight: '500',
    },
    previewLanguagePill: {
      alignSelf: 'flex-start',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      borderRadius: 999,
      paddingHorizontal: 12,
      paddingVertical: 8,
      backgroundColor: colors.shellCard,
      borderWidth: 1,
      borderColor: colors.shellBorder,
    },
    previewLanguageText: {
      color: colors.shellTextPrimary,
      fontSize: 12,
      fontWeight: '800',
    },
    previewList: {
      alignItems: 'stretch',
    },
    slide: {
      paddingRight: 8,
    },
    slideCard: {
      flex: 1,
      gap: 18,
    },
    slideMediaShell: {
      paddingHorizontal: 6,
      paddingTop: 2,
    },
    slideMediaFrame: {
      aspectRatio: isWide ? 1.55 : 1.28,
      borderRadius: 36,
      padding: 10,
      backgroundColor: colors.shellCard,
      borderWidth: 6,
      borderColor: colors.shellCardSoft,
      overflow: 'hidden',
      shadowColor: colors.ambientShadowStrong,
      shadowOpacity: 0.18,
      shadowRadius: 30,
      shadowOffset: { width: 0, height: 18 },
      elevation: 4,
      position: 'relative',
    },
    slideImage: {
      width: '100%',
      height: '100%',
      borderRadius: 26,
    },
    slideIndexPill: {
      position: 'absolute',
      top: 18,
      right: 18,
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 6,
      backgroundColor: alpha(colors.inverseSurface, 0.78),
    },
    slideIndexText: {
      color: colors.inverseText,
      fontSize: 11,
      fontWeight: '800',
      letterSpacing: 1,
    },
    slideCopy: {
      paddingHorizontal: 4,
      paddingTop: 8,
      paddingBottom: 12,
      gap: 8,
      alignItems: 'center',
    },
    slideCopyCard: {
      width: '100%',
      borderRadius: 28,
      paddingVertical: 6,
      paddingHorizontal: 8,
      alignItems: 'center',
    },
    slideTitle: {
      color: colors.shellTextPrimary,
      fontSize: compact ? 20 : 26,
      lineHeight: compact ? 26 : 32,
      fontWeight: '900',
      letterSpacing: -0.9,
      textAlign: 'center',
    },
    slideBody: {
      color: colors.shellTextSecondary,
      fontSize: compact ? 13 : 14,
      lineHeight: compact ? 19 : 22,
      fontWeight: '500',
      textAlign: 'center',
    },
    previewFooter: {
      gap: 14,
      marginTop: 18,
      paddingLeft: compact ? 18 : 28,
      paddingRight: compact ? 18 : 32,
    },
    pagination: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
    },
    paginationDot: {
      width: 8,
      height: 8,
      borderRadius: 999,
      backgroundColor: alpha(colors.shellTextSoft, 0.6),
    },
    paginationDotActive: {
      width: 24,
      backgroundColor: colors.primary,
    },
    previewActions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      alignSelf: 'stretch',
      paddingHorizontal: compact ? 4 : 10,
    },
    secondaryButton: {
      flex: 1,
      minHeight: 52,
      paddingHorizontal: 14,
      borderRadius: 18,
      backgroundColor: colors.shellCard,
      borderWidth: 1,
      borderColor: colors.shellBorder,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
    },
    secondaryButtonDisabled: {
      opacity: 0.45,
    },
    secondaryButtonText: {
      color: colors.shellTextPrimary,
      fontSize: 13,
      fontWeight: '800',
    },
  });
};
