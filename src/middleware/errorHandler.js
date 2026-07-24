import { logger } from '../core/logger.js';

export function errorHandler(error, req, res, next) {
  logger.error('Unhandled request error', {
    path: req.path,
    method: req.method,
    message: error.message,
    statusCode: error.statusCode
  });

  if (res.headersSent) {
    return next(error);
  }

  const statusCode = error.statusCode || 500;
  const message = error.message || '服务异常';

  if (req.path === '/api/travel') {
    return res.status(statusCode).json({
      html: `<div style="color:#ff9caa;padding:18px;border:1px solid rgba(255,120,140,0.25);border-radius:16px;">接口调用异常：${message}</div>`
    });
  }

  if (req.path.startsWith('/api/auth/callback/')) {
    const loginPage = new URL('/auth-center.html', 'http://localhost');
    loginPage.searchParams.set('status', 'error');
    loginPage.searchParams.set('message', message);
    return res.redirect(loginPage.pathname + loginPage.search);
  }

  return res.status(statusCode).json({
    error: message
  });
}
