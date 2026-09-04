import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async rewrites() {
    const egdeskApiUrl = process.env.NEXT_PUBLIC_EGDESK_API_URL || "http://localhost:8080";
    return [
      {
        source: "/__apps_script_proxy/:path*",
        destination: `${egdeskApiUrl}/apps-script/tools/call`,
      },
      {
        source: "/__drive_proxy/:path*",
        destination: `${egdeskApiUrl}/drive/tools/call`,
      },
      {
        source: "/__user_data_proxy/:path*",
        destination: `${egdeskApiUrl}/user-data/tools/call`,
      },
      {
        source: "/__sheets_proxy/:path*",
        destination: `${egdeskApiUrl}/sheets/tools/call`,
      },
    ];
  },
};

export default nextConfig;
