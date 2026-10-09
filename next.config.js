/** @type {import('next').NextConfig} */
console.log('🔍 DEBUG next.config.js: EGDESK_BASE_PATH env var =', process.env.EGDESK_BASE_PATH);
console.log('🔍 DEBUG next.config.js: NODE_ENV =', process.env.NODE_ENV);

// Only use basePath in production mode, not in dev mode (npm run dev)
const isDevelopment = process.env.NODE_ENV === 'development';
const basePath = isDevelopment ? '' : (process.env.EGDESK_BASE_PATH || '');

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

const nextConfig = {
  basePath: basePath,
  assetPrefix: basePath,

  // Allow LAN/IP access to the dev server (Next.js 15+)
  allowedDevOrigins: getLocalIPs(),

  // Always skip TypeScript and ESLint errors to prevent blocking on auto-generated files
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
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
  }
};

console.log('🔍 DEBUG next.config.js: isDevelopment =', isDevelopment);
console.log('🔍 DEBUG next.config.js: basePath =', nextConfig.basePath);
console.log('🔍 DEBUG next.config.js: assetPrefix =', nextConfig.assetPrefix);

export default nextConfig;
