import type { NextConfig } from "next";

console.log('🔍 DEBUG next.config: EGDESK_BASE_PATH env var =', process.env.EGDESK_BASE_PATH);

/**
 * 🔍 Automatically detect local IPv4 addresses to allow LAN access.
 */
const getLocalIPs = () => {
  try {
    const os = require('os');
    const interfaces = os.networkInterfaces();
    const ips = ['localhost', '127.0.0.1'];
    for (const name of Object.keys(interfaces)) {
      for (const iface of interfaces[name]) {
        if (iface.family === 'IPv4' && !iface.internal) {
          ips.push(iface.address);
          const parts = iface.address.split('.');
          if (parts.length === 4) {
            ips.push(`${parts[0]}.${parts[1]}.${parts[2]}.*`);
          }
        }
      }
    }
    return Array.from(new Set(ips));
  } catch (e) {
    return ['localhost', '127.0.0.1', '192.168.0.*', '192.168.1.*', '10.0.0.*'];
  }
};

const nextConfig: any = {
  // 🚀 SheetBot은 독자적인 커스텀 도메인(sheetbot.cloud)을 사용하므로 basePath를 항상 루트("")로 고정
  // EGDESK_BASE_PATH 주입으로 인한 404 및 60초 Gateway timeout 원천 차단
  basePath: '',
  assetPrefix: '',
  // Allow LAN/IP access to the dev server (Next.js 15+)
  allowedDevOrigins: getLocalIPs(),
  typescript: {
    // Always skip TypeScript errors to prevent blocking on auto-generated files
    ignoreBuildErrors: true,
  },
  eslint: {
    // Always skip ESLint errors to prevent blocking on auto-generated files
    ignoreDuringBuilds: true,
  },
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb',
      allowedOrigins: [
        'localhost:3000',
        '127.0.0.1:3000',
        'localhost:4000',
        '127.0.0.1:4000',
        '*.loca.lt',
        '*.ngrok.io',
        '*.ngrok-free.app',
        '*.trycloudflare.com',
        '*.gitpod.io',
        '*.tryhook.io',
        '*.localto.net'
      ]
    }
  },
  reactStrictMode: true,
  async redirects() {
    return [
      {
        source: "/downloads/SheetBotAgent.apk",
        destination: "https://github.com/Charismagreat/SheetBot/releases/download/user-v2.1.12/SheetBotAgent.apk",
        permanent: false,
      },
      {
        source: "/downloads/SheetBotAgent2.apk",
        destination: "https://github.com/Charismagreat/SheetBot/releases/download/user-v2.1.12/SheetBotAgent.apk",
        permanent: false,
      },
      {
        source: "/download/SheetBotAgent.apk",
        destination: "https://github.com/Charismagreat/SheetBot/releases/download/user-v2.1.12/SheetBotAgent.apk",
        permanent: false,
      },
      {
        source: "/downloads/sheetbot-deposit-agent.apk",
        destination: "https://github.com/Charismagreat/SheetBot/releases/download/v1.5.2/sheetbot-deposit-agent.apk",
        permanent: false,
      },
    ];
  },
  async rewrites() {
    const defaultTunnelUrl = "https://tunneling-service.onrender.com/t/mcp-server-fxkud1";
    const egdeskApiUrl =
      process.env.NEXT_PUBLIC_EGDESK_API_URL ||
      process.env.NEXT_PUBLIC_EGDESK_TUNNEL_URL ||
      (process.env.NODE_ENV === "development" ? "http://localhost:8080" : defaultTunnelUrl);
    return [
      {
        source: "/t/:tunnel/p/:project/:path*",
        destination: "/:path*",
      },
      {
        source: "/t/:tunnel/:path*",
        destination: "/:path*",
      },
      {
        source: "/__visitor_auth_proxy/:path*",
        destination: `${egdeskApiUrl}/visitor-auth/tools/call`,
      },
      {
        source: "/__visitor_auth_proxy",
        destination: `${egdeskApiUrl}/visitor-auth/tools/call`,
      },
      {
        source: "/__visitor_google_proxy/:path*",
        destination: `${egdeskApiUrl}/visitor-google/tools/call`,
      },
      {
        source: "/__visitor_google_proxy",
        destination: `${egdeskApiUrl}/visitor-google/tools/call`,
      },
      {
        source: "/__ai_caller_proxy/:path*",
        destination: `${egdeskApiUrl}/ai-caller/tools/call`,
      },
      {
        source: "/__ai_caller_proxy",
        destination: `${egdeskApiUrl}/ai-caller/tools/call`,
      },
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
        source: "/download/:filename*",
        destination: "/downloads/:filename*",
      },
      {
        source: "/__sheets_proxy/:path*",
        destination: `${egdeskApiUrl}/sheets/tools/call`,
      },
    ];
  },
};

console.log('🔍 DEBUG next.config: Final config basePath =', nextConfig.basePath);
console.log('🔍 DEBUG next.config: Final config assetPrefix =', nextConfig.assetPrefix);


export default nextConfig;
