/** @type {import('next').NextConfig} */
const isProd = process.env.NODE_ENV === 'production';

const nextConfig = {
  output: isProd ? 'export' : undefined,
  images: {
    unoptimized: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  ...(isProd
    ? {}
    : {
        async rewrites() {
          return [
            {
              source: '/pwa',
              destination: '/pwa/index.html',
            },
            {
              source: '/pwa/',
              destination: '/pwa/index.html',
            },
            {
              source: '/api/:path*',
              destination: 'http://localhost:3001/api/:path*',
            },
          ];
        },
      }),
};

export default nextConfig;
