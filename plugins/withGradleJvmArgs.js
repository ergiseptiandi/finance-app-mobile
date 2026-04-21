const { withGradleProperties } = require('expo/config-plugins');

const GRADLE_JVM_ARGS_KEY = 'org.gradle.jvmargs';
const GRADLE_DAEMON_LOGGING_KEY = 'org.gradle.daemon.performance.disable-logging';

const GRADLE_JVM_ARGS_VALUE = '-Xmx4096m -XX:MaxMetaspaceSize=1024m -Dfile.encoding=UTF-8';
const GRADLE_DAEMON_LOGGING_VALUE = 'true';

const upsertProperty = (items, key, value) => {
  const nextItems = [...items];
  const existingIndex = nextItems.findIndex((item) => item.type === 'property' && item.key === key);

  if (existingIndex >= 0) {
    nextItems[existingIndex] = {
      type: 'property',
      key,
      value,
    };
    return nextItems;
  }

  nextItems.push({
    type: 'property',
    key,
    value,
  });

  return nextItems;
};

module.exports = function withGradleJvmArgs(config) {
  return withGradleProperties(config, (config) => {
    config.modResults = upsertProperty(config.modResults, GRADLE_JVM_ARGS_KEY, GRADLE_JVM_ARGS_VALUE);
    config.modResults = upsertProperty(config.modResults, GRADLE_DAEMON_LOGGING_KEY, GRADLE_DAEMON_LOGGING_VALUE);
    return config;
  });
};
