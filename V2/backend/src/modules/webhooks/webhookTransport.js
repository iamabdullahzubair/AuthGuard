import { lookup } from 'node:dns/promises';
import { BlockList } from 'node:net';
import { Agent, fetch } from 'undici';

const blocked = new BlockList();
for (const [network, prefix] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8],
  ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24],
  ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24],
  ['224.0.0.0', 4], ['240.0.0.0', 4],
]) blocked.addSubnet(network, prefix, 'ipv4');
for (const [network, prefix] of [
  ['::', 128], ['::1', 128], ['::ffff:0:0', 96], ['64:ff9b::', 96],
  ['100::', 64], ['2001:db8::', 32], ['fc00::', 7], ['fe80::', 10], ['ff00::', 8],
]) blocked.addSubnet(network, prefix, 'ipv6');

function assertPublicAddress(address, family) {
  if (blocked.check(address, family === 4 ? 'ipv4' : 'ipv6')) {
    throw new Error('Webhook destination resolves to a non-public IP address');
  }
}

async function createPinnedAgent(url) {
  const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (!host || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) {
    throw new Error('Webhook destination must be a public hostname');
  }

  const addresses = await lookup(host, { all: true, verbatim: true });
  if (!addresses.length) throw new Error('Webhook hostname did not resolve');
  for (const item of addresses) assertPublicAddress(item.address, item.family);
  const pinned = addresses[0];

  return new Agent({
    connect: {
      lookup(hostname, options, callback) {
        if (hostname.toLowerCase() !== host) {
          callback(new Error('Unexpected DNS lookup during webhook request'));
          return;
        }
        if (options?.all) {
          callback(null, [{ address: pinned.address, family: pinned.family }]);
        } else {
          callback(null, pinned.address, pinned.family);
        }
      },
    },
  });
}

async function readResponsePreview(body, limit = 4096) {
  if (!body) return '';
  const reader = body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (size < limit) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = Buffer.from(value).subarray(0, limit - size);
      chunks.push(chunk);
      size += chunk.length;
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  return Buffer.concat(chunks).toString('utf8');
}

export async function postWebhook(urlValue, headers, body) {
  const url = new URL(urlValue);
  if (url.protocol !== 'https:' || url.username || url.password) {
    throw new Error('Webhook URL must use HTTPS and must not contain credentials');
  }
  const agent = await createPinnedAgent(url);
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body,
      dispatcher: agent,
      redirect: 'manual',
      signal: AbortSignal.timeout(8_000),
    });
    return { status: response.status, ok: response.ok, body: await readResponsePreview(response.body) };
  } finally {
    await agent.close();
  }
}
