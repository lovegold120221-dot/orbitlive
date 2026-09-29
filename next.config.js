/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false,
  // Off in production. With this on, the complete original TypeScript — every
  // file, every comment, including architecture notes that name which env vars
  // hold which secrets — is published at /_next/static/chunks/*.map and served
  // to anyone who asks. No secret VALUE leaked this way (the keys are read from
  // the environment at runtime and appear nowhere in the build output), but the
  // source is free reconnaissance.
  productionBrowserSourceMaps: false,
  output: 'standalone',
  images: {
    formats: ['image/webp'],
  },
  webpack: (config, { buildId, dev, isServer, defaultLoaders, nextRuntime, webpack }) => {
    // Important: return the modified config
    config.module.rules.push({
      test: /\.mjs$/,
      enforce: 'pre',
      use: ['source-map-loader'],
    });

    return config;
  },
  headers: async () => {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'Cross-Origin-Opener-Policy',
            value: 'same-origin',
          },
          {
            key: 'Cross-Origin-Embedder-Policy',
            value: 'credentialless',
          },
          // This deployment terminates TLS in front of the app, so the HSTS
          // header belongs here rather than at the edge.
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload',
          },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          // The app was framable, which leaves it open to clickjacking — a
          // meeting UI is exactly the wrong thing to render in someone's iframe.
          { key: 'X-Frame-Options', value: 'DENY' },
          {
            key: 'Referrer-Policy',
            // Keeps meeting URLs (which carry the E2EE passphrase in the
            // fragment, and tokens on some routes) out of outbound Referer.
            value: 'strict-origin-when-cross-origin',
          },
          {
            key: 'Permissions-Policy',
            // camera/microphone are self-only. `speaker-selection` must stay
            // permitted or setSinkId is blocked, which would break the speaker
            // dropdown and the Test sound button in Settings.
            value:
              'camera=(self), microphone=(self), display-capture=(self), speaker-selection=(self), geolocation=(), payment=(), usb=(), serial=(), bluetooth=(), hid=()',
          },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
