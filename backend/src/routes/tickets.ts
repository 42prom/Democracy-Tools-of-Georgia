import { Router, Request, Response, NextFunction } from 'express';
import { requireCredential } from '../middleware/auth';
import {
  createTicket,
  getTicketById,
  listTickets,
  addTicketResponse,
  getTicketResponses,
  TicketCategory,
  TicketPriority,
} from '../services/tickets';

const router = Router();

// Helper to safely get string from query param
const getQueryString = (param: unknown): string | undefined => {
  if (typeof param === 'string') return param;
  if (Array.isArray(param) && param.length > 0) return String(param[0]);
  return undefined;
};

/**
 * POST /api/v1/tickets
 * Create a new support ticket (authenticated users)
 */
router.post('/', requireCredential, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { subject, message, category, priority, deviceInfo } = req.body;
    const userId = req.credential?.sub;

    if (!subject || !message) {
      return res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'Subject and message are required' },
      });
    }

    if (subject.length > 200) {
      return res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'Subject must be 200 characters or less' },
      });
    }

    if (message.length > 5000) {
      return res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'Message must be 5000 characters or less' },
      });
    }

    const validCategories: TicketCategory[] = ['general', 'account', 'voting', 'technical', 'verification', 'rewards', 'other'];
    const validPriorities: TicketPriority[] = ['low', 'medium', 'high', 'urgent'];

    const ticketCategory = validCategories.includes(category) ? category : 'general';
    const ticketPriority = validPriorities.includes(priority) ? priority : 'medium';

    const ticket = await createTicket({
      userId,
      subject,
      message,
      category: ticketCategory,
      priority: ticketPriority,
      userDeviceInfo: deviceInfo,
    });

    console.log(`[Tickets] Created ticket ${ticket.ticketNumber} for user ${userId}`);

    return res.status(201).json({
      success: true,
      ticket: {
        id: ticket.id,
        ticketNumber: ticket.ticketNumber,
        subject: ticket.subject,
        category: ticket.category,
        priority: ticket.priority,
        status: ticket.status,
        createdAt: ticket.createdAt,
      },
    });
  } catch (error) {
    return next(error);
  }
});

/**
 * GET /api/v1/tickets
 * List user's tickets
 */
router.get('/', requireCredential, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.credential?.sub;
    const page = parseInt(getQueryString(req.query.page) || '1', 10);
    const pageSize = parseInt(getQueryString(req.query.pageSize) || '20', 10);
    const status = getQueryString(req.query.status);

    const { tickets, total } = await listTickets(
      { userId, status: status as any },
      page,
      pageSize
    );

    return res.json({
      tickets: tickets.map((t) => ({
        id: t.id,
        ticketNumber: t.ticketNumber,
        subject: t.subject,
        category: t.category,
        priority: t.priority,
        status: t.status,
        createdAt: t.createdAt,
        updatedAt: t.updatedAt,
      })),
      total,
      page,
      pageSize,
    });
  } catch (error) {
    return next(error);
  }
});

/**
 * GET /api/v1/tickets/:id
 * Get ticket details with responses
 */
router.get('/:id', requireCredential, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = String(req.params.id);
    const userId = req.credential?.sub as string | undefined;

    const ticket = await getTicketById(id, userId);
    if (!ticket) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Ticket not found' },
      });
    }

    const responses = await getTicketResponses(id, false); // Don't include internal notes

    return res.json({
      ticket: {
        id: ticket.id,
        ticketNumber: ticket.ticketNumber,
        subject: ticket.subject,
        message: ticket.message,
        category: ticket.category,
        priority: ticket.priority,
        status: ticket.status,
        createdAt: ticket.createdAt,
        updatedAt: ticket.updatedAt,
        resolvedAt: ticket.resolvedAt,
      },
      responses: responses.map((r) => ({
        id: r.id,
        message: r.message,
        isAdmin: r.isAdmin,
        createdAt: r.createdAt,
        senderName: r.isAdmin ? 'Support Team' : 'You',
      })),
    });
  } catch (error) {
    return next(error);
  }
});

/**
 * POST /api/v1/tickets/:id/respond
 * Add a response to a ticket
 */
router.post('/:id/respond', requireCredential, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = String(req.params.id);
    const { message } = req.body;
    const userId = req.credential?.sub as string | undefined;

    if (!message || message.trim().length === 0) {
      return res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'Message is required' },
      });
    }

    if (message.length > 5000) {
      return res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'Message must be 5000 characters or less' },
      });
    }

    // Verify user owns the ticket
    const ticket = await getTicketById(id, userId);
    if (!ticket) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Ticket not found' },
      });
    }

    if (ticket.status === 'closed') {
      return res.status(400).json({
        error: { code: 'TICKET_CLOSED', message: 'Cannot respond to a closed ticket' },
      });
    }

    const response = await addTicketResponse(id, message.trim(), false, userId);

    console.log(`[Tickets] User ${userId} responded to ticket ${ticket.ticketNumber}`);

    return res.status(201).json({
      success: true,
      response: {
        id: response.id,
        message: response.message,
        isAdmin: response.isAdmin,
        createdAt: response.createdAt,
      },
    });
  } catch (error) {
    return next(error);
  }
});

export default router;
