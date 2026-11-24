import express from 'express';
import helmet from 'helmet';
import { env } from './config/env.js';
import { APIResponse } from './common/APIResponse.js';
import apiRoutes from './routes.js';

export const app = express();

app.disable('x-powered-by');
app.set('trust proxy', env.V2_TRUST_PROXY_HOPS);
app.use(helmet());
app.use(express.json({ limit: '1mb' }));

app.get('/api/v2/health', (_req, res) => {
  APIResponse.success(res, { service: 'AuthGuard', timestamp: new Date().toISOString() }, { message: 'Service healthy' });
});

app.use('/api/v2', apiRoutes);

app.use('/api/v2', (_req, res) => {
  APIResponse.error(res, { statusCode: 404, code: 'ENDPOINT_NOT_FOUND', message: 'Endpoint not found' });
});

app.use((error, _req, res, _next) => {
  console.error('[v2 unhandled error]', error);
  const status = Number.isInteger(error.status) && error.status >= 400 && error.status < 500 ? error.status : 500;
  APIResponse.error(res, {
    statusCode: status,
    code: error.code || (status === 500 ? 'INTERNAL_SERVER_ERROR' : 'REQUEST_FAILED'),
    message: status === 500 ? 'Internal Server Error' : error.message,
  });
});
