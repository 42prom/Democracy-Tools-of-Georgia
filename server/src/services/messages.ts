import { query } from '../db/client.js';

export interface CreateMessageData {
  title: string;
  body?: string;
  type: 'announcement' | 'alert' | 'reminder';
  audience_rules: any;
  publish_at?: string;
  expire_at?: string;
}

export async function createMessage(data: CreateMessageData) {
  const result = await query(
    `INSERT INTO messages (title, body, type, status, audience_rules, publish_at, expire_at)
     VALUES ($1, $2, $3, 'draft', $4, $5, $6)
     RETURNING *`,
    [
      data.title,
      data.body || '',
      data.type,
      JSON.stringify(data.audience_rules || {}),
      data.publish_at || null,
      data.expire_at || null,
    ]
  );
  return result.rows[0];
}

export async function getMessage(id: string) {
  const result = await query('SELECT * FROM messages WHERE id = $1', [id]);
  return result.rows[0] || null;
}

export async function listMessages(status?: string) {
  if (status) {
    const result = await query(
      'SELECT * FROM messages WHERE status = $1 ORDER BY created_at DESC',
      [status]
    );
    return result.rows;
  }
  const result = await query('SELECT * FROM messages ORDER BY created_at DESC');
  return result.rows;
}

export async function updateMessage(
  id: string,
  data: Partial<CreateMessageData> & { status?: string; publish_at?: string | null; expire_at?: string | null }
) {
  const fields: string[] = [];
  const values: any[] = [];
  let idx = 1;

  if (data.title !== undefined) {
    fields.push(`title = $${idx++}`);
    values.push(data.title);
  }
  if (data.body !== undefined) {
    fields.push(`body = $${idx++}`);
    values.push(data.body);
  }
  if (data.type !== undefined) {
    fields.push(`type = $${idx++}`);
    values.push(data.type);
  }
  if (data.audience_rules !== undefined) {
    fields.push(`audience_rules = $${idx++}`);
    values.push(JSON.stringify(data.audience_rules));
  }
  if (data.publish_at !== undefined) {
    fields.push(`publish_at = $${idx++}`);
    values.push(data.publish_at);
  }
  if (data.expire_at !== undefined) {
    fields.push(`expire_at = $${idx++}`);
    values.push(data.expire_at);
  }
  if (data.status !== undefined) {
    fields.push(`status = $${idx++}`);
    values.push(data.status);
  }

  if (fields.length === 0) {
    return getMessage(id);
  }

  fields.push(`updated_at = NOW()`);
  values.push(id);

  const result = await query(
    `UPDATE messages SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
    values
  );
  return result.rows[0] || null;
}

export async function publishMessage(id: string) {
  const msg = await getMessage(id);
  if (!msg) throw new Error('Message not found');

  if (msg.publish_at && new Date(msg.publish_at) > new Date()) {
    // Future publish_at → schedule
    await query(
      `UPDATE messages SET status = 'scheduled', updated_at = NOW() WHERE id = $1`,
      [id]
    );
    return { message: 'Message scheduled', status: 'scheduled' };
  }

  // Immediate publish
  await query(
    `UPDATE messages SET status = 'published', published_at = NOW(), updated_at = NOW() WHERE id = $1`,
    [id]
  );
  return { message: 'Message published', status: 'published' };
}

export async function archiveMessage(id: string) {
  const msg = await getMessage(id);
  if (!msg) throw new Error('Message not found');

  await query(
    `UPDATE messages SET status = 'archived', updated_at = NOW() WHERE id = $1`,
    [id]
  );
  return { message: 'Message archived' };
}
