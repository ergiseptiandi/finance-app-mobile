import * as Device from 'expo-device';

export const getDeviceName = () =>
  Device.deviceName?.trim() || Device.modelName?.trim() || 'Finance-GO Device';
