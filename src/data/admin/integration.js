/**
 * integration.js – Data dummy Integrasi API watsap.id
 */

export const ADMIN_API_CONFIG = {
  provider: 'watsap.id',
  baseUrl: 'https://api.watsap.id/v1',
  apiKey: 'afblast_live_k89x2la9821hdkla92109841',
  webhookUrl: 'https://app.afblast.id/api/v1/webhooks/watsap',
  webhookSecret: 'whsec_99a8b7c6d5e4f3a2b1',
  status: 'connected',
  autoReconnect: true,
  maxConcurrentQueues: 16,
  connectionTimeoutSeconds: 30,
  lastPingTime: '2026-10-18 18:45:12',
  nodesAvailable: [
    { name: 'Gateway Node 1 - Singapore', status: 'healthy', latency: 45 },
    { name: 'Gateway Node 2 - Jakarta', status: 'healthy', latency: 18 },
    { name: 'Gateway Node 3 - Jakarta 2', status: 'healthy', latency: 22 },
  ],
}
