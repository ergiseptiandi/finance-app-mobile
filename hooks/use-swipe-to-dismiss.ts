import { useCallback, useRef } from 'react';
import { Animated, PanResponder, type PanResponderGestureState } from 'react-native';

const SWIPE_THRESHOLD = 100;
const SWIPE_VELOCITY_THRESHOLD = 0.5;

export function useSwipeToDismiss(onDismiss: () => void) {
  const translateY = useRef(new Animated.Value(0)).current;

  const handleDismiss = useCallback(() => {
    Animated.timing(translateY, {
      toValue: 0,
      duration: 200,
      useNativeDriver: true,
    }).start();
    onDismiss();
  }, [onDismiss, translateY]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_event, gesture: PanResponderGestureState) => {
        return gesture.dy > 10 && Math.abs(gesture.dx) < Math.abs(gesture.dy);
      },
      onPanResponderMove: (_event, gesture: PanResponderGestureState) => {
        if (gesture.dy > 0) {
          translateY.setValue(Math.max(0, gesture.dy * 0.6));
        }
      },
      onPanResponderRelease: (_event, gesture: PanResponderGestureState) => {
        if (gesture.dy > SWIPE_THRESHOLD || gesture.vy > SWIPE_VELOCITY_THRESHOLD) {
          Animated.timing(translateY, {
            toValue: 400,
            duration: 200,
            useNativeDriver: true,
          }).start(handleDismiss);
        } else {
          Animated.spring(translateY, {
            toValue: 0,
            useNativeDriver: true,
            bounciness: 6,
          }).start();
        }
      },
      onPanResponderTerminate: () => {
        Animated.spring(translateY, {
          toValue: 0,
          useNativeDriver: true,
          bounciness: 6,
        }).start();
      },
    })
  ).current;

  return { translateY, panResponder, handleDismiss };
}
