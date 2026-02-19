import { pool } from '../db/client';

export type TicketStatus = 'open' | 'in_progress' | 'waiting_user' | 'resolved' | 'closed';
export type TicketPriority = 'low' | 'medium' | 'high' | 'urgent';
export type TicketCategory = 'general' | 'account' | 'voting' | 'technical' | 'verification' | 'rewards' | 'other';

export interface Ticket {
  id: string;
  ticketNumber: string;
  userId: string | null;
  subject: string;
  message: string;
  category: TicketCategory;
  priority: TicketPriority;
  status: TicketStatus;
  assignedAdminId: string | null;
  userEmail: string | null;
  userDeviceInfo: Record<string, any> | null;
  attachments: string[];
  createdAt: Date;
  updatedAt: Date;
  resolvedAt: Date | null;
  closedAt: Date | null;
}

export interface TicketResponse {
  id: string;
  ticketId: string;
  userId: string | null;
  adminId: string | null;
  isAdmin: boolean;
  message: string;
  attachments: string[];
  isInternalNote: boolean;
  createdAt: Date;
}

export interface CreateTicketInput {
  userId?: string;
  subject: string;
  message: string;
  category?: TicketCategory;
  priority?: TicketPriority;
  userEmail?: string;
  userDeviceInfo?: Record<string, any>;
}

export interface TicketFilters {
  status?: TicketStatus | TicketStatus[];
  priority?: TicketPriority | TicketPriority[];
  category?: TicketCategory;
  assignedAdminId?: string;
  search?: string;
  userId?: string;
}

/**
 * Create a new support ticket
 */
export async function createTicket(input: CreateTicketInput): Promise<Ticket> {
  const {
    userId,
    subject,
    message,
    category = 'general',
    priority = 'medium',
    userEmail,
    userDeviceInfo,
  } = input;

  const result = await pool.query(
    `INSERT INTO tickets (user_id, subject, message, category, priority, user_email, user_device_info)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [userId || null, subject, message, category, priority, userEmail || null, userDeviceInfo ? JSON.stringify(userDeviceInfo) : null]
  );

  return mapTicketRow(result.rows[0]);
}

/**
 * Get ticket by ID
 */
export async function getTicketById(ticketId: string, userId?: string): Promise<Ticket | null> {
  let query = `SELECT * FROM tickets WHERE id = $1`;
  const params: any[] = [ticketId];

  // If userId provided, ensure user owns the ticket
  if (userId) {
    query += ` AND user_id = $2`;
    params.push(userId);
  }

  const result = await pool.query(query, params);
  if (result.rows.length === 0) return null;
  return mapTicketRow(result.rows[0]);
}

/**
 * Get ticket by ticket number
 */
export async function getTicketByNumber(ticketNumber: string): Promise<Ticket | null> {
  const result = await pool.query(
    `SELECT * FROM tickets WHERE ticket_number = $1`,
    [ticketNumber]
  );
  if (result.rows.length === 0) return null;
  return mapTicketRow(result.rows[0]);
}

/**
 * List tickets with filters and pagination
 */
export async function listTickets(
  filters: TicketFilters,
  page: number = 1,
  pageSize: number = 20,
  sortBy: string = 'created_at',
  sortOrder: 'asc' | 'desc' = 'desc'
): Promise<{ tickets: Ticket[]; total: number }> {
  const conditions: string[] = [];
  const params: any[] = [];
  let paramIndex = 1;

  if (filters.userId) {
    conditions.push(`user_id = $${paramIndex++}`);
    params.push(filters.userId);
  }

  if (filters.status) {
    if (Array.isArray(filters.status)) {
      conditions.push(`status = ANY($${paramIndex++}::ticket_status[])`);
      params.push(filters.status);
    } else {
      conditions.push(`status = $${paramIndex++}`);
      params.push(filters.status);
    }
  }

  if (filters.priority) {
    if (Array.isArray(filters.priority)) {
      conditions.push(`priority = ANY($${paramIndex++}::ticket_priority[])`);
      params.push(filters.priority);
    } else {
      conditions.push(`priority = $${paramIndex++}`);
      params.push(filters.priority);
    }
  }

  if (filters.category) {
    conditions.push(`category = $${paramIndex++}`);
    params.push(filters.category);
  }

  if (filters.assignedAdminId) {
    conditions.push(`assigned_admin_id = $${paramIndex++}`);
    params.push(filters.assignedAdminId);
  }

  if (filters.search) {
    conditions.push(`(subject ILIKE $${paramIndex} OR message ILIKE $${paramIndex} OR ticket_number ILIKE $${paramIndex})`);
    params.push(`%${filters.search}%`);
    paramIndex++;
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  // Get total count
  const countResult = await pool.query(
    `SELECT COUNT(*) as count FROM tickets ${whereClause}`,
    params
  );
  const total = parseInt(countResult.rows[0].count, 10);

  // Validate sort column
  const validSortColumns = ['created_at', 'updated_at', 'priority', 'status', 'ticket_number'];
  const safeSortBy = validSortColumns.includes(sortBy) ? sortBy : 'created_at';
  const safeSortOrder = sortOrder === 'asc' ? 'ASC' : 'DESC';

  // Add pagination params
  const offset = (page - 1) * pageSize;
  params.push(pageSize, offset);

  const ticketsResult = await pool.query(
    `SELECT t.*,
            u.first_name as user_first_name,
            u.last_name as user_last_name,
            u.pn_masked as user_pn_masked,
            a.email as admin_email
     FROM tickets t
     LEFT JOIN users u ON t.user_id = u.id
     LEFT JOIN admin_users a ON t.assigned_admin_id = a.id
     ${whereClause}
     ORDER BY
       CASE WHEN t.priority = 'urgent' THEN 0
            WHEN t.priority = 'high' THEN 1
            WHEN t.priority = 'medium' THEN 2
            ELSE 3 END,
       ${safeSortBy} ${safeSortOrder}
     LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
    params
  );

  return {
    tickets: ticketsResult.rows.map(mapTicketRowWithUser),
    total,
  };
}

/**
 * Add response to a ticket
 */
export async function addTicketResponse(
  ticketId: string,
  message: string,
  isAdmin: boolean,
  userId?: string,
  adminId?: string,
  isInternalNote: boolean = false
): Promise<TicketResponse> {
  const result = await pool.query(
    `INSERT INTO ticket_responses (ticket_id, user_id, admin_id, is_admin, message, is_internal_note)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [ticketId, userId || null, adminId || null, isAdmin, message, isInternalNote]
  );

  // If admin responds, update status to in_progress if it was open
  if (isAdmin && !isInternalNote) {
    await pool.query(
      `UPDATE tickets SET status = 'in_progress' WHERE id = $1 AND status = 'open'`,
      [ticketId]
    );
  }

  // If user responds, update status to open if it was waiting_user
  if (!isAdmin) {
    await pool.query(
      `UPDATE tickets SET status = 'open' WHERE id = $1 AND status = 'waiting_user'`,
      [ticketId]
    );
  }

  return mapResponseRow(result.rows[0]);
}

/**
 * Get responses for a ticket
 */
export async function getTicketResponses(
  ticketId: string,
  includeInternalNotes: boolean = false
): Promise<TicketResponse[]> {
  let query = `
    SELECT tr.*,
           u.first_name as user_first_name,
           u.last_name as user_last_name,
           a.email as admin_email
    FROM ticket_responses tr
    LEFT JOIN users u ON tr.user_id = u.id
    LEFT JOIN admin_users a ON tr.admin_id = a.id
    WHERE tr.ticket_id = $1
  `;

  if (!includeInternalNotes) {
    query += ` AND tr.is_internal_note = false`;
  }

  query += ` ORDER BY tr.created_at ASC`;

  const result = await pool.query(query, [ticketId]);
  return result.rows.map(mapResponseRowWithUser);
}

/**
 * Update ticket status
 */
export async function updateTicketStatus(
  ticketId: string,
  status: TicketStatus,
  adminId?: string
): Promise<Ticket | null> {
  const updates: string[] = ['status = $2'];
  const params: any[] = [ticketId, status];
  let paramIndex = 3;

  if (status === 'resolved') {
    updates.push(`resolved_at = NOW()`);
  } else if (status === 'closed') {
    updates.push(`closed_at = NOW()`);
  }

  if (adminId && status === 'in_progress') {
    updates.push(`assigned_admin_id = $${paramIndex++}`);
    params.push(adminId);
  }

  const result = await pool.query(
    `UPDATE tickets SET ${updates.join(', ')} WHERE id = $1 RETURNING *`,
    params
  );

  if (result.rows.length === 0) return null;
  return mapTicketRow(result.rows[0]);
}

/**
 * Assign ticket to admin
 */
export async function assignTicket(ticketId: string, adminId: string): Promise<Ticket | null> {
  const result = await pool.query(
    `UPDATE tickets SET assigned_admin_id = $2, status = 'in_progress' WHERE id = $1 RETURNING *`,
    [ticketId, adminId]
  );

  if (result.rows.length === 0) return null;
  return mapTicketRow(result.rows[0]);
}

/**
 * Get ticket statistics
 */
export async function getTicketStats(): Promise<{
  total: number;
  open: number;
  inProgress: number;
  waitingUser: number;
  resolved: number;
  avgResponseTime: number | null;
}> {
  const result = await pool.query(`
    SELECT
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE status = 'open') as open,
      COUNT(*) FILTER (WHERE status = 'in_progress') as in_progress,
      COUNT(*) FILTER (WHERE status = 'waiting_user') as waiting_user,
      COUNT(*) FILTER (WHERE status = 'resolved' OR status = 'closed') as resolved
    FROM tickets
  `);

  const stats = result.rows[0];

  // Calculate average response time (time from ticket creation to first admin response)
  const avgTimeResult = await pool.query(`
    SELECT AVG(EXTRACT(EPOCH FROM (tr.created_at - t.created_at))) / 3600 as avg_hours
    FROM tickets t
    INNER JOIN ticket_responses tr ON t.id = tr.ticket_id
    WHERE tr.is_admin = true
    AND tr.id = (
      SELECT id FROM ticket_responses
      WHERE ticket_id = t.id AND is_admin = true
      ORDER BY created_at ASC LIMIT 1
    )
  `);

  return {
    total: parseInt(stats.total, 10),
    open: parseInt(stats.open, 10),
    inProgress: parseInt(stats.in_progress, 10),
    waitingUser: parseInt(stats.waiting_user, 10),
    resolved: parseInt(stats.resolved, 10),
    avgResponseTime: avgTimeResult.rows[0]?.avg_hours ? parseFloat(avgTimeResult.rows[0].avg_hours) : null,
  };
}

// Helper functions to map database rows to typed objects
function mapTicketRow(row: any): Ticket {
  return {
    id: row.id,
    ticketNumber: row.ticket_number,
    userId: row.user_id,
    subject: row.subject,
    message: row.message,
    category: row.category,
    priority: row.priority,
    status: row.status,
    assignedAdminId: row.assigned_admin_id,
    userEmail: row.user_email,
    userDeviceInfo: row.user_device_info,
    attachments: row.attachments || [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    resolvedAt: row.resolved_at,
    closedAt: row.closed_at,
  };
}

function mapTicketRowWithUser(row: any): Ticket & { userName?: string; adminEmail?: string } {
  const ticket = mapTicketRow(row);
  return {
    ...ticket,
    userName: row.user_first_name && row.user_last_name
      ? `${row.user_first_name} ${row.user_last_name}`
      : row.user_pn_masked || 'Anonymous',
    adminEmail: row.admin_email,
  };
}

function mapResponseRow(row: any): TicketResponse {
  return {
    id: row.id,
    ticketId: row.ticket_id,
    userId: row.user_id,
    adminId: row.admin_id,
    isAdmin: row.is_admin,
    message: row.message,
    attachments: row.attachments || [],
    isInternalNote: row.is_internal_note,
    createdAt: row.created_at,
  };
}

function mapResponseRowWithUser(row: any): TicketResponse & { userName?: string; adminEmail?: string } {
  const response = mapResponseRow(row);
  return {
    ...response,
    userName: row.user_first_name && row.user_last_name
      ? `${row.user_first_name} ${row.user_last_name}`
      : undefined,
    adminEmail: row.admin_email,
  };
}
