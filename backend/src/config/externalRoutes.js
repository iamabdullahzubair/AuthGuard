/**
 * External Exposed Routes Registry
 * Defines all endpoints that external client applications can call with their API Key.
 * Each route is scoped under `/api/tenant/:tenantId/` and protected by `apiKeyAuth`.
 */
export const EXTERNAL_EXPOSED_ROUTES = [
  {
    path: '/api/tenant/:tenantId/users/status',
    method: 'GET',
    name: 'CHECK_USER_STATUS',
    description: 'Check whether a user is enrolled in AuthGuard and list active 2FA factors (push, totp)',
  },
  {
    path: '/api/tenant/:tenantId/push/challenge',
    method: 'POST',
    name: 'TRIGGER_PUSH_CHALLENGE',
    description: 'Trigger an out-of-band 2FA push notification to the user device with a 2-digit matching challenge',
  },
  {
    path: '/api/tenant/:tenantId/push/status/:requestId',
    method: 'GET',
    name: 'GET_PUSH_STATUS',
    description: 'Check the real-time status of an initiated push challenge (pending, approved, denied, expired)',
  },
  {
    path: '/api/tenant/:tenantId/totp/verify',
    method: 'POST',
    name: 'VERIFY_TOTP_CODE',
    description: 'Verify a 6-digit TOTP passcode with anti-replay protection',
  },
  {
    path: '/api/tenant/:tenantId/enroll',
    method: 'POST',
    name: 'ENROLL_USER',
    description: 'Enroll a new end user and generate a setup QR code for scanning with the AuthGuard app',
  },
];
