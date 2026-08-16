/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: { typedRoutes: true },
  transpilePackages: ["@narrative/db"],
  serverExternalPackages: ["@prisma/client", "prisma"]
};

export default nextConfig;
