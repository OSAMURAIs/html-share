import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  TransactWriteCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
  marshallOptions: { removeUndefinedValues: true },
});
const TASK_TTL_SECONDS = 90 * 24 * 60 * 60;
const PAIR_TTL_SECONDS = 10 * 60;

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

function json(statusCode: number, body: unknown): any {
  return {
    statusCode,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-robots-tag': 'noindex, nofollow',
    },
    body: JSON.stringify(body),
  };
}

function parseBody(event: any): Record<string, any> {
  if (!event.body) return {};
  const source = event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString('utf8') : event.body;
  try {
    return JSON.parse(source);
  } catch {
    throw Object.assign(new Error('Invalid JSON'), { statusCode: 400 });
  }
}

function clean(value: unknown, name: string, maximum: number, needed = false): string {
  const result = typeof value === 'string' ? value.trim() : '';
  if (needed && !result) throw Object.assign(new Error(`${name} is required`), { statusCode: 400 });
  if (result.length > maximum) throw Object.assign(new Error(`${name} is too long`), { statusCode: 400 });
  return result;
}

function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function normalizeCode(value: unknown): string {
  return String(value ?? '').replace(/[^A-Z2-9]/gi, '').toUpperCase();
}

function pairingCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = randomBytes(8);
  const text = [...bytes].map((byte) => alphabet[byte % alphabet.length]).join('');
  return `${text.slice(0, 4)}-${text.slice(4)}`;
}

function method(event: any): string {
  return event.requestContext?.http?.method ?? event.httpMethod ?? 'GET';
}

function pathname(event: any): string {
  return event.rawPath ?? event.requestContext?.http?.path ?? '';
}

function validOrigin(event: any): boolean {
  return String(event.headers?.origin ?? '') === required('CONSOLE_ORIGIN');
}

async function device(event: any): Promise<{ id: string; name: string } | null> {
  const token = String(event.headers?.['x-review-device-token'] ?? '');
  if (!/^[A-Za-z0-9_-]{40,}$/.test(token)) return null;
  const id = hash(token);
  const result = await ddb.send(new GetCommand({
    TableName: required('REVIEW_TABLE_NAME'),
    Key: { pk: 'DEVICE', sk: id },
    ConsistentRead: true,
  }));
  if (!result.Item || result.Item.revokedAt) return null;
  return { id, name: result.Item.name ?? 'Computer' };
}

async function tasks(): Promise<any[]> {
  const result = await ddb.send(new QueryCommand({
    TableName: required('REVIEW_TABLE_NAME'),
    KeyConditionExpression: 'pk = :pk',
    ExpressionAttributeValues: { ':pk': 'TASK' },
    ConsistentRead: true,
  }));
  return result.Items ?? [];
}

function publicTask(item: any): any {
  const { pk: _pk, sk: _sk, deviceId: _deviceId, expiresAt: _expiresAt, ...rest } = item;
  return rest;
}

export async function handler(event: any): Promise<any> {
  try {
    const verb = method(event);
    const path = pathname(event);
    const now = Math.floor(Date.now() / 1000);
    const table = required('REVIEW_TABLE_NAME');

    if (verb === 'POST' && path === '/api/pairings/claim') {
      const body = parseBody(event);
      const code = normalizeCode(body.code);
      if (code.length !== 8) return json(400, { error: 'Invalid pairing code' });
      const token = randomBytes(32).toString('base64url');
      const deviceId = hash(token);
      const name = clean(body.deviceName, 'deviceName', 80) || 'Computer';
      await ddb.send(new TransactWriteCommand({ TransactItems: [
        {
          Update: {
            TableName: table,
            Key: { pk: 'PAIR', sk: hash(code) },
            UpdateExpression: 'SET claimedAt = :now',
            ConditionExpression: 'attribute_exists(pk) AND attribute_not_exists(claimedAt) AND expiresAt > :now',
            ExpressionAttributeValues: { ':now': now },
          },
        },
        {
          Put: {
            TableName: table,
            Item: { pk: 'DEVICE', sk: deviceId, name, createdAt: new Date().toISOString() },
            ConditionExpression: 'attribute_not_exists(pk)',
          },
        },
      ] }));
      return json(200, { deviceToken: token, deviceName: name });
    }

    if (path.startsWith('/api/owner/')) {
      if (!validOrigin(event) && verb !== 'GET') return json(403, { error: 'Invalid origin' });
      if (verb === 'POST' && path === '/api/owner/pairings') {
        const code = pairingCode();
        await ddb.send(new PutCommand({
          TableName: table,
          Item: { pk: 'PAIR', sk: hash(normalizeCode(code)), createdAt: new Date().toISOString(), expiresAt: now + PAIR_TTL_SECONDS },
        }));
        return json(201, { code, expiresAt: now + PAIR_TTL_SECONDS });
      }
      if (verb === 'GET' && path === '/api/owner/reviews') {
        const items = (await tasks()).filter((item) => item.status !== 'completed').map(publicTask);
        return json(200, { items });
      }
      const answer = path.match(/^\/api\/owner\/reviews\/([^/]+)\/answer$/);
      if (verb === 'POST' && answer) {
        const body = parseBody(event);
        const responseText = clean(body.responseText, 'responseText', 4000);
        const approved = body.approved === true;
        if (!approved && !responseText) return json(400, { error: 'Approval or comment is required' });
        const result = await ddb.send(new UpdateCommand({
          TableName: table,
          Key: { pk: 'TASK', sk: answer[1] },
          UpdateExpression: 'SET #status = :status, approved = :approved, responseText = :response, updatedAt = :updatedAt',
          ConditionExpression: 'attribute_exists(pk) AND #status = :waiting',
          ExpressionAttributeNames: { '#status': 'status' },
          ExpressionAttributeValues: {
            ':status': 'answered', ':waiting': 'waiting', ':approved': approved, ':response': responseText,
            ':updatedAt': new Date().toISOString(),
          },
          ReturnValues: 'ALL_NEW',
        }));
        return json(200, { item: publicTask(result.Attributes) });
      }
      return json(404, { error: 'Not found' });
    }

    if (path.startsWith('/api/device/')) {
      const current = await device(event);
      if (!current) return json(401, { error: 'Device authentication is required' });
      if (verb === 'POST' && path === '/api/device/reviews') {
        const body = parseBody(event);
        const id = randomUUID();
        const item = {
          pk: 'TASK', sk: id, id, deviceId: current.id,
          sessionId: clean(body.sessionId, 'sessionId', 180, true),
          title: clean(body.title, 'title', 160, true),
          question: clean(body.question, 'question', 1000, true),
          context: clean(body.context, 'context', 3000),
          recommendation: clean(body.recommendation, 'recommendation', 1000),
          status: 'waiting',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          expiresAt: now + TASK_TTL_SECONDS,
        };
        await ddb.send(new PutCommand({ TableName: table, Item: item, ConditionExpression: 'attribute_not_exists(pk)' }));
        return json(201, { item: publicTask(item) });
      }
      if (verb === 'GET' && path === '/api/device/reviews') {
        const status = event.queryStringParameters?.status;
        const sessionId = event.queryStringParameters?.sessionId;
        const items = (await tasks())
          .filter((item) => item.deviceId === current.id)
          .filter((item) => !status || item.status === status)
          .filter((item) => !sessionId || item.sessionId === sessionId)
          .map(publicTask);
        return json(200, { items });
      }
      const complete = path.match(/^\/api\/device\/reviews\/([^/]+)\/complete$/);
      if (verb === 'POST' && complete) {
        await ddb.send(new UpdateCommand({
          TableName: table,
          Key: { pk: 'TASK', sk: complete[1] },
          UpdateExpression: 'SET #status = :completed, completedAt = :now, updatedAt = :now',
          ConditionExpression: 'attribute_exists(pk) AND deviceId = :deviceId',
          ExpressionAttributeNames: { '#status': 'status' },
          ExpressionAttributeValues: { ':completed': 'completed', ':deviceId': current.id, ':now': new Date().toISOString() },
        }));
        return json(200, { ok: true });
      }
      return json(404, { error: 'Not found' });
    }

    return json(404, { error: 'Not found' });
  } catch (error: any) {
    console.error(JSON.stringify({ level: 'error', message: error instanceof Error ? error.message : 'Unknown error' }));
    return json(error?.statusCode ?? (error?.name === 'ConditionalCheckFailedException' ? 409 : 500), {
      error: error?.name === 'ConditionalCheckFailedException' ? 'This request is expired or already used' : 'Request failed',
    });
  }
}
