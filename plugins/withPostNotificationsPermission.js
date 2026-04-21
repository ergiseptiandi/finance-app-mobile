const { withAndroidManifest } = require('expo/config-plugins');

/**
 * Expo config plugin that adds android.permission.POST_NOTIFICATIONS to AndroidManifest.xml.
 *
 * Android 13+ (API 33) requires this permission to be declared in the manifest
 * AND requested at runtime for notifications to be displayed.
 * Without it, requestPermissionsAsync() silently fails and push notifications
 * are never shown even when FCM successfully delivers them.
 */
module.exports = function withPostNotificationsPermission(config) {
  return withAndroidManifest(config, (config) => {
    const manifest = config.modResults.manifest;

    if (!manifest['uses-permission']) {
      manifest['uses-permission'] = [];
    }

    const permissions = manifest['uses-permission'];
    const permissionName = 'android.permission.POST_NOTIFICATIONS';

    const alreadyExists = permissions.some(
      (entry) => entry.$?.['android:name'] === permissionName
    );

    if (!alreadyExists) {
      permissions.push({
        $: { 'android:name': permissionName },
      });
    }

    return config;
  });
};
