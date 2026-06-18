/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    return [
      {
        source: '/api/identity/:path*',
        destination: 'http://localhost:8080/:path*',
      },
      {
        source: '/api/ingestion/:path*',
        destination: 'http://localhost:8083/:path*',
      },
    ];
  },
};

export default nextConfig;
