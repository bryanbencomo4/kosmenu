const isProduction = process.env.NODE_ENV === 'production';

function buildContentSecurityPolicy({ allowAppFrame = false } = {}) {
  const frameAncestors = allowAppFrame
    ? "frame-ancestors 'self' https://app.elmenuxfa.com http://localhost:3000 http://localhost:5000 http://localhost:8080 http://127.0.0.1:3000 http://127.0.0.1:5000 http://127.0.0.1:8080"
    : "frame-ancestors 'none'";

  return [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${isProduction ? '' : " 'unsafe-eval'"} https://maps.googleapis.com https://maps.gstatic.com`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data: https://fonts.gstatic.com",
    "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://maps.googleapis.com https://maps.gstatic.com",
    "frame-src 'self' https://*.supabase.co https://maps.googleapis.com https://maps.gstatic.com",
    frameAncestors,
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
    "manifest-src 'self'",
    "media-src 'self' data: blob: https:",
    "worker-src 'self' blob:",
    isProduction ? 'upgrade-insecure-requests' : '',
  ]
    .filter(Boolean)
    .join('; ');
}

function buildSecurityHeaders({ allowAppFrame = false } = {}) {
  // X-Frame-Options is applied in middleware so /preview/* can omit it for app iframe embedding.
  return [
    {
      key: 'X-Content-Type-Options',
      value: 'nosniff',
    },
    {
      key: 'Referrer-Policy',
      value: 'strict-origin-when-cross-origin',
    },
    {
      key: 'Permissions-Policy',
      value:
        'accelerometer=(), autoplay=(), camera=(), geolocation=(self), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()',
    },
    {
      key: 'Content-Security-Policy',
      value: buildContentSecurityPolicy({ allowAppFrame }),
    },
    ...(allowAppFrame
      ? [
          {
            key: 'X-Robots-Tag',
            value: 'noindex, nofollow, noarchive',
          },
        ]
      : []),
    ...(isProduction
      ? [
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=31536000; includeSubDomains; preload',
          },
        ]
      : []),
  ];
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  async headers() {
    return [
      // More specific preview route first so iframe embedding from the app works.
      {
        source: '/preview/:path*',
        headers: buildSecurityHeaders({ allowAppFrame: true }),
      },
      {
        source: '/:path*',
        headers: buildSecurityHeaders({ allowAppFrame: false }),
      },
      {
        source: '/.well-known/apple-app-site-association',
        headers: [
          ...buildSecurityHeaders({ allowAppFrame: false }),
          {
            key: 'Content-Type',
            value: 'application/json',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
