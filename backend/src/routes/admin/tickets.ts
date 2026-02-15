import { Router, Request, Response, NextFunction } from 'express';
import { requireAdmin } from '../../middleware/auth';
import {
  listTickets,
  getTicketById,
  addTicketResponse,
  getTicketResponses,
  updateTicketStatus,
  assignTicket,
  getTicketStats,
  TicketStatus,
  TicketPriority,
  TicketCategory,
} from '../../services/tickets';

const router = Router();

// All admin ticket routes require authentication
router.use(requireAdmin);

// Helper to safely get string from query param
const getQueryString = (param: unknown): string | undefined => {
  if (typeof param === 'string') return param;
  if (Array.isArray(param) && param.length > 0) return String(param[0]);
  return undefined;
};

/**
 * GET /api/v1/admin/tickets/stats
 * Get ticket statistics for dashboard
 */
router.get('/stats', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const stats = await getTicketStats();
    return res.json(stats);
  } catch (error) {
    return next(error);
  }
});

/**
 * GET /api/v1/admin/tickets
 * List all tickets with filters
 */
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = parseInt(getQueryString(req.query.page) || '1', 10);
    const pageSize = parseInt(getQueryString(req.query.pageSize) || '20', 10);
    const status = getQueryString(req.query.status);
    const priority = getQueryString(req.query.priority);
    const category = getQueryString(req.query.category);
    const search = getQueryString(req.query.search);
    const assignedTo = getQueryString(req.query.assignedTo);
    const sortBy = getQueryString(req.query.sortBy) || 'created_at';
    const sortOrder = (getQueryString(req.query.sortOrder) || 'desc') as 'asc' | 'desc';

    // Parse status filter (can be comma-separated)
    let statusFilter: TicketStatus | TicketStatus[] | undefined;
    if (status) {
      const statuses = status.split(',') as TicketStatus[];
      statusFilter = statuses.length === 1 ? statuses[0] : statuses;
    }

    // Parse priority filter
    let priorityFilter: TicketPriority | TicketPriority[] | undefined;
    if (priority) {
      const priorities = priority.split(',') as TicketPriority[];
      priorityFilter = priorities.length === 1 ? priorities[0] : priorities;
    }

    const { tickets, total } = await listTickets(
      {
        status: statusFilter,
        priority: priorityFilter,
        category: category as TicketCategory | undefined,
        assignedAdminId: assignedTo,
        search: search,
      },
      page,
      pageSize,
      sortBy,
      sortOrder
    );

    return res.json({
      tickets: tickets.map((t: any) => ({
        id: t.id,
        ticketNumber: t.ticketNumber,
        subject: t.subject,
        category: t.category,
        priority: t.priority,
        status: t.status,
        userName: t.userName,
        assignedAdmin: t.adminEmail,
        createdAt: t.createdAt,
        updatedAt: t.updatedAt,
      })),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    });
  } catch (error) {
    return next(error);
  }
});

/**
 * GET /api/v1/admin/tickets/:id
 * Get ticket details with all responses (including internal notes)
 */
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = String(req.params.id);

    const ticket = await getTicketById(id);
    if (!ticket) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Ticket not found' },
      });
    }

    const responses = await getTicketResponses(id, true); // Include internal notes

    return res.json({
      ticket: {
        id: ticket.id,
        ticketNumber: ticket.ticketNumber,
        userId: ticket.userId,
        subject: ticket.subject,
        message: ticket.message,
        category: ticket.category,
        priority: ticket.priority,
        status: ticket.status,
        assignedAdminId: ticket.assignedAdminId,
        userEmail: ticket.userEmail,
        userDeviceInfo: ticket.userDeviceInfo,
        createdAt: ticket.createdAt,
        updatedAt: ticket.updatedAt,
        resolvedAt: ticket.resolvedAt,
        closedAt: ticket.closedAt,
      },
      responses: responses.map((r: any) => ({
        id: r.id,
        message: r.message,
        isAdmin: r.isAdmin,
        isInternalNote: r.isInternalNote,
        createdAt: r.createdAt,
        senderName: r.isAdmin ? (r.adminEmail || 'Admin') : (r.userName || 'User'),
      })),
    });
  } catch (error) {
    return next(error);
  }
});

/**
 * POST /api/v1/admin/tickets/:id/respond
 * Add admin response to a ticket
 */
router.post('/:id/respond', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = String(req.params.id);
    const { message, isInternalNote = false, setStatus } = req.body;
    const adminId = (req as any).adminUser?.id as string | undefined;

    if (!message || message.trim().length === 0) {
      return res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'Message is required' },
      });
    }

    const ticket = await getTicketById(id);
    if (!ticket) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Ticket not found' },
      });
    }

    const response = await addTicketResponse(
      id,
      message.trim(),
      true,
      undefined,
      adminId,
      isInternalNote
    );

    // Optionally update status with the response
    if (setStatus && ['open', 'in_progress', 'waiting_user', 'resolved', 'closed'].includes(setStatus)) {
      await updateTicketStatus(id, setStatus, adminId);
    }

    console.log(`[Tickets] Admin ${adminId} responded to ticket ${ticket.ticketNumber}${isInternalNote ? ' (internal note)' : ''}`);

    return res.status(201).json({
      success: true,
      response: {
        id: response.id,
        message: response.message,
        isAdmin: response.isAdmin,
        isInternalNote: response.isInternalNote,
        createdAt: response.createdAt,
      },
    });
  } catch (error) {
    return next(error);
  }
});

/**
 * PATCH /api/v1/admin/tickets/:id/status
 * Update ticket status
 */
router.patch('/:id/status', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = String(req.params.id);
    const { status } = req.body;
    const adminId = (req as any).adminUser?.id as string | undefined;

    const validStatuses: TicketStatus[] = ['open', 'in_progress', 'waiting_user', 'resolved', 'closed'];
    if (!status || !validStatuses.includes(status)) {
      return res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'Invalid status' },
      });
    }

    const updatedTicket = await updateTicketStatus(id, status, adminId);
    if (!updatedTicket) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Ticket not found' },
      });
    }

    console.log(`[Tickets] Admin ${adminId} updated ticket ${updatedTicket.ticketNumber} status to ${status}`);

    return res.json({
      success: true,
      ticket: {
        id: updatedTicket.id,
        ticketNumber: updatedTicket.ticketNumber,
        status: updatedTicket.status,
      },
    });
  } catch (error) {
    return next(error);
  }
});

/**
 * PATCH /api/v1/admin/tickets/:id/assign
 * Assign ticket to an admin
 */
router.patch('/:id/assign', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = String(req.params.id);
    const { adminId } = req.body;
    const currentAdminId = (req as any).adminUser?.id as string;

    // If no adminId provided, assign to current admin
    const assignToId = adminId || currentAdminId;

    const updatedTicket = await assignTicket(id, assignToId);
    if (!updatedTicket) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Ticket not found' },
      });
    }

    console.log(`[Tickets] Admin ${currentAdminId} assigned ticket ${updatedTicket.ticketNumber} to ${assignToId}`);

    return res.json({
      success: true,
      ticket: {
        id: updatedTicket.id,
        ticketNumber: updatedTicket.ticketNumber,
        assignedAdminId: updatedTicket.assignedAdminId,
      },
    });
  } catch (error) {
    return next(error);
  }
});

/**
 * PATCH /api/v1/admin/tickets/:id/priority
 * Update ticket priority
 */
router.patch('/:id/priority', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = String(req.params.id);
    const { priority } = req.body;

    const validPriorities: TicketPriority[] = ['low', 'medium', 'high', 'urgent'];
    if (!priority || !validPriorities.includes(priority)) {
      return res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'Invalid priority' },
      });
    }

    const { pool } = await import('../../db/client');
    const result = await pool.query(
      `UPDATE tickets SET priority = $2 WHERE id = $1 RETURNING id, ticket_number, priority`,
      [id, priority]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Ticket not found' },
      });
    }

    return res.json({
      success: true,
      ticket: {
        id: result.rows[0].id,
        ticketNumber: result.rows[0].ticket_number,
        priority: result.rows[0].priority,
      },
    });
  } catch (error) {
    return next(error);
  }
});

export default router;
