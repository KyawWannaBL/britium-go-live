import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  // Enterprise Portal has its own Android identity. Do not reuse the legacy
  // com.britium.express package because older differently-signed builds can
  // cause Android to reject installation with "App not installed".
  appId: 'com.britiumexpress.enterpriseportal',
  appName: 'Britium Enterprise Portal',
  webDir: 'dist',
  android: {
    allowMixedContent: false
  }
};

export default config;
