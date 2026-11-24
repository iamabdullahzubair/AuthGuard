export class APIResponse {
  static success(res, data = null, { statusCode = 200, message = 'Request successful', meta } = {}) {
    const body = { success: true, message, data };
    if (meta !== undefined) body.meta = meta;
    return res.status(statusCode).json(body);
  }

  static error(res, {
    statusCode = 500,
    message = 'Internal Server Error',
    code = 'INTERNAL_SERVER_ERROR',
    details,
  } = {}) {
    const body = { success: false, message, error: { code } };
    if (details !== undefined) body.error.details = details;
    return res.status(statusCode).json(body);
  }
}
