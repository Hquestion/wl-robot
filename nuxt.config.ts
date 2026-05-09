/* eslint-disable nuxt/nuxt-config-keys-order */
export default defineNuxtConfig({
  devtools: { enabled: true },
  modules: ['@nuxt/eslint'],
  compatibilityDate: '2026-05-09',
  runtimeConfig: {
    robot: {
      enabled: process.env.ROBOT_ENABLED === 'true',
      inboxDir: process.env.ROBOT_INBOX_DIR || 'storage/inbox',
      downloadTimeoutSeconds: Number(process.env.ROBOT_DOWNLOAD_TIMEOUT_SECONDS || 30),
    },
  },
  eslint: {
    config: {
      stylistic: true,
    },
  },
})
