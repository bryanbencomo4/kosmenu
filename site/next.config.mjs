const isProduction = process.env.NODE_ENV === 'production';

function buildContentSecurityPolicy() {
  return [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${isProduction ? '' : " 'unsafe-eval'"} https://maps.googleapis.com https://maps.gstatic.com`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data: https://fonts.gstatic.com",
    "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://maps.googleapis.com https://maps.gstatic.com",
    "frame-src 'self' https://*.supabase.co https://maps.googleapis.com https://maps.gstatic.com",
    "frame-ancestors 'none'",
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

const securityHeaders = [
  {
    key: 'X-Frame-Options',
    value: 'DENY',
  },
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
    value: 'accelerometer=(), autoplay=(), camera=(), geolocation=(self), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()',
  },
  {
    key: 'Content-Security-Policy',
    value: buildContentSecurityPolicy(),
  },
  ...(isProduction
    ? [
        {
          key: 'Strict-Transport-Security',
          value: 'max-age=31536000; includeSubDomains; preload',
        },
      ]
    : []),
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  async headers() {
    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
      {
        source: '/.well-known/apple-app-site-association',
        headers: [
          ...securityHeaders,
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
