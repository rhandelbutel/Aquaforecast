/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  webpack: (config) => {
    if (!config.output) config.output = {}
    // Increase chunk load timeout to mitigate dev-time chunk stalls on slow FS
    config.output.chunkLoadTimeout = 300000
    return config
  },
}

export default nextConfig
