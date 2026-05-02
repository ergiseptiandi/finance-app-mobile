import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useEffect, useRef } from 'react';
import { Animated, Platform, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, alpha, type AppColorTheme } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export type ToastData = {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
  duration?: number;
};

type ToastItemProps = {
  toast: ToastData;
  onDismiss: (id: string) => void;
  colors: AppColorTheme;
  topInset: number;
};

const TOAST_ICONS: Record<ToastType, keyof typeof MaterialCommunityIcons.glyphMap> = {
  success: 'check-circle-outline',
  error: 'alert-circle-outline',
  warning: 'alert-outline',
  info: 'information-outline',
};

const TOAST_COLORS: Record<ToastType, { bg: string; border: string; icon: string }> = {
  success: { bg: '#0f7a52', border: '#0f7a52', icon: '#ffffff' },
  error: { bg: '#dc3545', border: '#dc3545', icon: '#ffffff' },
  warning: { bg: '#f59e0b', border: '#f59e0b', icon: '#ffffff' },
  info: { bg: '#3b82f6', border: '#3b82f6', icon: '#ffffff' },
};

function ToastItem({ toast, onDismiss, colors, topInset }: ToastItemProps) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(-20)).current;
  const palette = TOAST_COLORS[toast.type];
  const icon = TOAST_ICONS[toast.type];
  const duration = toast.duration ?? 3000;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 250,
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration: 250,
        useNativeDriver: true,
      }),
    ]).start();

    const timer = setTimeout(() => {
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(translateY, {
          toValue: -20,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start(() => onDismiss(toast.id));
    }, duration);

    return () => clearTimeout(timer);
  }, [toast.id, duration, onDismiss, opacity, translateY]);

  return (
    <Animated.View
      style={[
        styles.toastContainer,
        {
          top: topInset + 12,
          opacity,
          transform: [{ translateY }],
          backgroundColor: palette.bg,
          borderColor: palette.border,
        },
      ]}>
      <MaterialCommunityIcons name={icon} size={20} color={palette.icon} />
      <View style={styles.toastContent}>
        <Text style={styles.toastTitle} numberOfLines={1}>
          {toast.title}
        </Text>
        {toast.message ? (
          <Text style={styles.toastMessage} numberOfLines={2}>
            {toast.message}
          </Text>
        ) : null}
      </View>
    </Animated.View>
  );
}

export type ToastRef = {
  show: (type: ToastType, title: string, message?: string) => void;
  success: (title: string, message?: string) => void;
  error: (title: string, message?: string) => void;
  warning: (title: string, message?: string) => void;
  info: (title: string, message?: string) => void;
};

let toastIdCounter = 0;

export function useToast(): ToastRef {
  const toastsRef = useRef<ToastData[]>([]);
  const listenersRef = useRef<((toasts: ToastData[]) => void)[]>([]);

  const notify = () => {
    listenersRef.current.forEach((fn) => fn([...toastsRef.current]));
  };

  const addToast = (type: ToastType, title: string, message?: string) => {
    const id = `toast-${++toastIdCounter}`;
    const toast: ToastData = { id, type, title, message };
    toastsRef.current = [...toastsRef.current.slice(-2), toast];
    notify();
  };

  const dismissToast = (id: string) => {
    toastsRef.current = toastsRef.current.filter((t) => t.id !== id);
    notify();
  };

  const ref: ToastRef = {
    show: addToast,
    success: (title, msg) => addToast('success', title, msg),
    error: (title, msg) => addToast('error', title, msg),
    warning: (title, msg) => addToast('warning', title, msg),
    info: (title, msg) => addToast('info', title, msg),
  };

  return ref;
}

// Global toast state for use across the app
type GlobalToastState = {
  toasts: ToastData[];
  listeners: ((toasts: ToastData[]) => void)[];
};

const globalState: GlobalToastState = {
  toasts: [],
  listeners: [],
};

export const toast = {
  show: (type: ToastType, title: string, message?: string) => {
    const id = `toast-${++toastIdCounter}`;
    const toastData: ToastData = { id, type, title, message };
    globalState.toasts = [...globalState.toasts.slice(-2), toastData];
    globalState.listeners.forEach((fn) => fn([...globalState.toasts]));
  },
  success: (title: string, message?: string) => toast.show('success', title, message),
  error: (title: string, message?: string) => toast.show('error', title, message),
  warning: (title: string, message?: string) => toast.show('warning', title, message),
  info: (title: string, message?: string) => toast.show('info', title, message),
  dismiss: (id: string) => {
    globalState.toasts = globalState.toasts.filter((t) => t.id !== id);
    globalState.listeners.forEach((fn) => fn([...globalState.toasts]));
  },
  subscribe: (listener: (toasts: ToastData[]) => void) => {
    globalState.listeners.push(listener);
    return () => {
      globalState.listeners = globalState.listeners.filter((fn) => fn !== listener);
    };
  },
  getToasts: () => [...globalState.toasts],
};

export function ToastContainer() {
  const colorScheme = useColorScheme() ?? 'light';
  const colors = Colors[colorScheme];
  const insets = useSafeAreaInsets();
  const [toasts, setToasts] = useState<ToastData[]>([]);

  useEffect(() => {
    return globalState.listeners.length > 0
      ? (() => {
          const handler = (t: ToastData[]) => setToasts(t);
          globalState.listeners.push(handler);
          return () => {
            globalState.listeners = globalState.listeners.filter((fn) => fn !== handler);
          };
        })()
      : undefined;
  }, []);

  useEffect(() => {
    const unsubscribe = toast.subscribe(setToasts);
    return unsubscribe;
  }, []);

  return (
    <View style={styles.toastOverlay} pointerEvents="box-none">
      {toasts.map((t) => (
        <ToastItem
          key={t.id}
          toast={t}
          onDismiss={toast.dismiss}
          colors={colors}
          topInset={insets.top}
        />
      ))}
    </View>
  );
}

import { useState } from 'react';

const styles = StyleSheet.create({
  toastOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 9999,
    alignItems: 'center',
  },
  toastContainer: {
    position: 'absolute',
    top: 60,
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 16,
    borderWidth: 1,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.15,
        shadowRadius: 12,
      },
      android: {
        elevation: 8,
      },
    }),
  },
  toastContent: {
    flex: 1,
    gap: 2,
  },
  toastTitle: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
  toastMessage: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 12,
    fontWeight: '500',
  },
});
