import type { NextConfig } from "next";

const nextConfig: NextConfig = {
    /* config options here */
    images: {
        remotePatterns: [
            {
                protocol: 'https',
                hostname: 'asquared.ae',
            },
            {
                protocol: 'https',
                hostname: 'user-images.githubusercontent.com',
            }
        ],
    },
};

export default nextConfig;
