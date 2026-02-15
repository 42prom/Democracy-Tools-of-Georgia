import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import type {
  Poll,
  CreatePollRequest,
  AudienceEstimate,
  AudienceRules,
  Region,
  CreateRegionRequest,
  PollResults,
  SecurityEventsSummary,
  ProfilesResponse,
  ProfileFilters,
  UserProfile,
  ExportRequest,
  ExportResponse,
  ParticipationRecord,
  InsightsResponse,
  Message,
  CreateMessageRequest,
  LoginRequest,
  AuthResponse,
  AdminUser,
} from '../types';

// TASK-P2-ADM-01: Configurable API base URL
// Supports VITE_API_BASE_URL or falls back to VITE_API_URL or /api/v1
const BASE_URL = import.meta.env.VITE_API_BASE_URL
  || import.meta.env.VITE_API_URL
  || '/api/v1';

// TASK-P2-ADM-02: Retry configuration
const MAX_RETRIES = parseInt(import.meta.env.VITE_API_MAX_RETRIES || '3', 10);
const RETRY_DELAY_MS = parseInt(import.meta.env.VITE_API_RETRY_DELAY || '1000', 10);
const API_TIMEOUT_MS = parseInt(import.meta.env.VITE_API_TIMEOUT || '15000', 10);

// HTTP status codes that are safe to retry
const RETRYABLE_STATUS_CODES = [408, 429, 500, 502, 503, 504];
// Error codes that indicate network issues (safe to retry)
const RETRYABLE_ERROR_CODES = ['ECONNABORTED', 'ETIMEDOUT', 'ECONNRESET', 'ECONNREFUSED', 'ERR_NETWORK'];

console.log('[API Client] Base URL:', BASE_URL);

const apiClient = axios.create({
  baseURL: BASE_URL,
  timeout: API_TIMEOUT_MS,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Admin authentication
apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('admin_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  // Initialize retry count
  (config as any).__retryCount = (config as any).__retryCount || 0;
  return config;
});

/**
 * Determine if an error is retryable
 */
function isRetryableError(error: AxiosError): boolean {
  // Network errors (no response)
  if (!error.response) {
    const code = error.code || '';
    return RETRYABLE_ERROR_CODES.includes(code);
  }

  // Server errors that may be transient
  return RETRYABLE_STATUS_CODES.includes(error.response.status);
}

/**
 * Determine if a request method is safe to retry (idempotent)
 */
function isIdempotentMethod(method: string | undefined): boolean {
  const idempotent = ['get', 'head', 'options', 'put', 'delete'];
  return idempotent.includes((method || '').toLowerCase());
}

/**
 * Sleep with exponential backoff + jitter
 */
function sleep(attempt: number): Promise<void> {
  const delay = RETRY_DELAY_MS * Math.pow(2, attempt - 1);
  const jitter = Math.random() * 300;
  return new Promise(resolve => setTimeout(resolve, delay + jitter));
}

// Response interceptor with retry logic (TASK-P2-ADM-02)
apiClient.interceptors.response.use(
  (response) => {
    return response;
  },
  async (error: AxiosError) => {
    const config = error.config as InternalAxiosRequestConfig & { __retryCount?: number };

    if (!config) {
      return Promise.reject(error);
    }

    const retryCount = config.__retryCount || 0;

    // Only retry GET requests (idempotent) and retryable errors
    if (
      isIdempotentMethod(config.method) &&
      isRetryableError(error) &&
      retryCount < MAX_RETRIES
    ) {
      config.__retryCount = retryCount + 1;
      console.log(`[API Retry] Attempt ${config.__retryCount}/${MAX_RETRIES} for ${config.url}`);

      await sleep(config.__retryCount);
      return apiClient.request(config);
    }

    // Log final error (after all retries exhausted or non-retryable)
    console.error('[API Error]', error.response?.status || 'NETWORK', config.url, error.message);
    return Promise.reject(error);
  }
);

// Admin Polls endpoints
export const adminPollsApi = {
  create: async (data: CreatePollRequest): Promise<Poll> => {
    const response = await apiClient.post('/admin/polls', data);
    return response.data;
  },

  estimate: async (rules: AudienceRules): Promise<AudienceEstimate> => {
    const response = await apiClient.post('/admin/polls/estimate', { rules });
    return response.data;
  },

  publish: async (pollId: string): Promise<Poll> => {
    const response = await apiClient.patch(`/admin/polls/${pollId}/publish`);
    return response.data;
  },

  list: async (status?: string): Promise<Poll[]> => {
    const response = await apiClient.get('/admin/polls', {
      params: status ? { status } : {},
    });
    return response.data;
  },

  getById: async (pollId: string): Promise<Poll> => {
    const response = await apiClient.get(`/admin/polls/${pollId}`);
    return response.data;
  },

  update: async (pollId: string, data: Partial<CreatePollRequest>): Promise<Poll> => {
    const response = await apiClient.patch(`/admin/polls/${pollId}`, data);
    return response.data;
  },

  delete: async (pollId: string): Promise<void> => {
    await apiClient.delete(`/admin/polls/${pollId}`);
  },
};

// Analytics endpoints
export const analyticsApi = {
  getPollResults: async (
    pollId: string,
    breakdownBy?: string[]
  ): Promise<PollResults> => {
    const response = await apiClient.get(`/admin/polls/${pollId}/results`, {
      params: breakdownBy ? { breakdownBy } : {},
    });
    return response.data;
  },

  getSurveyResults: async (pollId: string): Promise<any> => {
    const response = await apiClient.get(`/admin/polls/${pollId}/survey-results`);
    return response.data;
  },
};

// Security events endpoints
export const securityEventsApi = {
  getSummary: async (params?: {
    startDate?: string;
    endDate?: string;
    eventTypes?: string[];
  }): Promise<SecurityEventsSummary> => {
    const response = await apiClient.get('/admin/security-events/summary', {
      params,
    });
    return response.data;
  },
};

// Regions endpoints
export const regionsApi = {
  list: async (): Promise<Region[]> => {
    const response = await apiClient.get('/admin/regions');
    return response.data;
  },

  create: async (data: CreateRegionRequest): Promise<Region> => {
    const response = await apiClient.post('/admin/regions', data);
    return response.data;
  },

  update: async (regionId: string, data: Partial<CreateRegionRequest>): Promise<Region> => {
    const response = await apiClient.patch(`/admin/regions/${regionId}`, data);
    return response.data;
  },

  delete: async (regionId: string): Promise<void> => {
    await apiClient.delete(`/admin/regions/${regionId}`);
  },

  toggleActive: async (regionId: string, active: boolean): Promise<Region> => {
    const response = await apiClient.patch(`/admin/regions/${regionId}`, { active });
    return response.data;
  },

  importCSV: async (file: File): Promise<{ imported: number; errors: string[] }> => {
    const formData = new FormData();
    formData.append('file', file);
    const response = await apiClient.post('/admin/regions/import', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  },
};

// Profiles endpoints
export const profilesApi = {
  list: async (params: {
    filters?: ProfileFilters;
    page?: number;
    pageSize?: number;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }): Promise<ProfilesResponse> => {
    const response = await apiClient.get('/admin/profiles', {
      params: {
        ...params.filters,
        page: params.page,
        pageSize: params.pageSize,
        sortBy: params.sortBy,
        sortOrder: params.sortOrder,
      },
    });
    return response.data;
  },

  getById: async (profileId: string): Promise<UserProfile> => {
    const response = await apiClient.get(`/admin/profiles/${profileId}`);
    return response.data;
  },

  exportAggregated: async (filters: ProfileFilters): Promise<ExportResponse> => {
    const response = await apiClient.post('/admin/profiles/export', {
      type: 'aggregated',
      filters,
    } as ExportRequest);
    return response.data;
  },

  exportProfileList: async (filters: ProfileFilters): Promise<ExportResponse> => {
    const response = await apiClient.post('/admin/profiles/export', {
      type: 'profile_list',
      filters,
    } as ExportRequest);
    return response.data;
  },

  getParticipation: async (profileId: string): Promise<{ metadata: any; participationRecords: ParticipationRecord[] }> => {
    const response = await apiClient.get(`/admin/profiles/${profileId}/participation`);
    return response.data;
  },
  updateRegion: async (profileId: string, regionCode: string): Promise<{ success: boolean; regionCode: string }> => {
    const response = await apiClient.patch(`/admin/profiles/${profileId}/region`, { regionCode });
    return response.data;
  },

  resetSecurity: async (profileId: string, invalidateCredential: boolean = false): Promise<{ success: boolean; message: string; actions: string[] }> => {
    const response = await apiClient.post(`/admin/profiles/${profileId}/reset-security`, { invalidateCredential });
    return response.data;
  },

  resetEnrollment: async (profileId: string): Promise<{ success: boolean; message: string; deletedUser: { maskedPn: string; name: string }; actions: string[] }> => {
    const response = await apiClient.post(`/admin/profiles/${profileId}/reset-enrollment`);
    return response.data;
  },
};

// Insights endpoints
export const insightsApi = {
  getDistributions: async (params?: {
    dimensions?: string[];
    minDate?: string;
    maxDate?: string;
  }): Promise<InsightsResponse> => {
    const response = await apiClient.get('/admin/insights/distributions', {
      params,
    });
    return response.data;
  },
};

// Admin Messages endpoints
export const adminMessagesApi = {
  list: async (status?: string): Promise<Message[]> => {
    const response = await apiClient.get('/admin/messages', {
      params: status ? { status } : {},
    });
    return response.data;
  },

  create: async (data: CreateMessageRequest): Promise<Message> => {
    const response = await apiClient.post('/admin/messages', data);
    return response.data;
  },

  getById: async (id: string): Promise<Message> => {
    const response = await apiClient.get(`/admin/messages/${id}`);
    return response.data;
  },

  update: async (id: string, data: Partial<CreateMessageRequest> & { status?: string }): Promise<Message> => {
    const response = await apiClient.patch(`/admin/messages/${id}`, data);
    return response.data;
  },

  publish: async (id: string): Promise<{ message: string; status: string }> => {
    const response = await apiClient.post(`/admin/messages/${id}/publish`);
    return response.data;
  },

  archive: async (id: string): Promise<{ message: string }> => {
    const response = await apiClient.post(`/admin/messages/${id}/archive`);
    return response.data;
  },
};

export default apiClient;


// Admin Settings endpoints
export type AdminSettings = {
  rewards_enabled_global: boolean;
  nft_payouts_enabled_global: boolean;
  chain_id: number;
  rpc_url: string;
  nft_contract_address: string;
  dtg_token_address?: string;
  reward_token_id: number; // fixed to 1
  required_confirmations: number;
};

export const settingsApi = {
  get: async (): Promise<AdminSettings> => {
    const response = await apiClient.get('/admin/settings');
    return response.data;
  },
  update: async (data: Partial<AdminSettings>): Promise<AdminSettings> => {
    const response = await apiClient.patch('/admin/settings', data);
    return response.data;
  },
  testBlockchainConnection: async (rpcUrl: string): Promise<{ success: boolean; message: string }> => {
    const response = await apiClient.post('/admin/settings/blockchain/test', { rpcUrl });
    return response.data;
  },
};

export const authApi = {
  login: async (credentials: LoginRequest): Promise<AuthResponse> => {
    const response = await apiClient.post('/admin/auth/login', credentials);
    return response.data;
  },
  me: async (): Promise<AdminUser> => {
    const response = await apiClient.get('/admin/auth/me');
    return response.data;
  }
};

// Tickets API
export type TicketStatus = 'open' | 'in_progress' | 'waiting_user' | 'resolved' | 'closed';
export type TicketPriority = 'low' | 'medium' | 'high' | 'urgent';
export type TicketCategory = 'general' | 'account' | 'voting' | 'technical' | 'verification' | 'rewards' | 'other';

export interface Ticket {
  id: string;
  ticketNumber: string;
  subject: string;
  message?: string;
  category: TicketCategory;
  priority: TicketPriority;
  status: TicketStatus;
  userName?: string;
  assignedAdmin?: string;
  createdAt: string;
  updatedAt: string;
  resolvedAt?: string;
  closedAt?: string;
}

export interface TicketResponse {
  id: string;
  message: string;
  isAdmin: boolean;
  isInternalNote?: boolean;
  senderName: string;
  createdAt: string;
}

export interface TicketDetail {
  ticket: Ticket & {
    userId?: string;
    userEmail?: string;
    userDeviceInfo?: Record<string, unknown>;
    assignedAdminId?: string;
  };
  responses: TicketResponse[];
}

export interface TicketStats {
  total: number;
  open: number;
  inProgress: number;
  waitingUser: number;
  resolved: number;
  avgResponseTime: number | null;
}

export interface TicketsListResponse {
  tickets: Ticket[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

// Audit Export API
export interface AuditExportPreview {
  poll: {
    id: string;
    title: string;
    description: string | null;
    type: string;
    status: string;
    startAt: string | null;
    endAt: string | null;
    kAnonymity: number;
  };
  statistics: {
    totalVotes: number;
    totalParticipants: number;
    optionsCount: number;
  };
  exportOptions: {
    includeVoteLevelData: { default: boolean; description: string };
    anonymizeVoters: { default: boolean; description: string };
    dateRange: { available: boolean; description: string };
  };
}

export interface AuditExportOptions {
  includeVoteLevelData?: boolean;
  anonymizeVoters?: boolean;
  dateRangeStart?: string;
  dateRangeEnd?: string;
}

export const auditExportApi = {
  /**
   * Get preview/metadata for audit export (before downloading)
   */
  getPreview: async (pollId: string): Promise<AuditExportPreview> => {
    const response = await apiClient.get(`/admin/export/polls/${pollId}/audit/preview`);
    return response.data;
  },

  /**
   * Download audit export as CSV file
   */
  downloadCsv: async (pollId: string, options: AuditExportOptions = {}): Promise<void> => {
    const params = new URLSearchParams();
    if (options.includeVoteLevelData !== undefined) {
      params.append('includeVoteLevelData', String(options.includeVoteLevelData));
    }
    if (options.anonymizeVoters !== undefined) {
      params.append('anonymizeVoters', String(options.anonymizeVoters));
    }
    if (options.dateRangeStart) {
      params.append('dateRangeStart', options.dateRangeStart);
    }
    if (options.dateRangeEnd) {
      params.append('dateRangeEnd', options.dateRangeEnd);
    }

    const token = localStorage.getItem('admin_token');
    const url = `${apiClient.defaults.baseURL}/admin/export/polls/${pollId}/audit.csv?${params.toString()}`;

    // Use fetch for blob download
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Export failed' }));
      throw new Error(error.error || 'Export failed');
    }

    // Get filename from Content-Disposition header or generate default
    const contentDisposition = response.headers.get('Content-Disposition');
    let filename = `audit_export_${pollId}.csv`;
    if (contentDisposition) {
      const match = contentDisposition.match(/filename="(.+)"/);
      if (match) {
        filename = match[1];
      }
    }

    // Download the file
    const blob = await response.blob();
    const downloadUrl = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(downloadUrl);
  },

  /**
   * Download streamed audit export (for very large polls)
   */
  downloadStreamedCsv: async (pollId: string, options: AuditExportOptions = {}): Promise<void> => {
    const params = new URLSearchParams();
    if (options.includeVoteLevelData !== undefined) {
      params.append('includeVoteLevelData', String(options.includeVoteLevelData));
    }
    if (options.anonymizeVoters !== undefined) {
      params.append('anonymizeVoters', String(options.anonymizeVoters));
    }
    if (options.dateRangeStart) {
      params.append('dateRangeStart', options.dateRangeStart);
    }
    if (options.dateRangeEnd) {
      params.append('dateRangeEnd', options.dateRangeEnd);
    }

    const token = localStorage.getItem('admin_token');
    const url = `${apiClient.defaults.baseURL}/admin/export/polls/${pollId}/audit-stream.csv?${params.toString()}`;

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Export failed' }));
      throw new Error(error.error || 'Export failed');
    }

    const contentDisposition = response.headers.get('Content-Disposition');
    let filename = `audit_export_stream_${pollId}.csv`;
    if (contentDisposition) {
      const match = contentDisposition.match(/filename="(.+)"/);
      if (match) {
        filename = match[1];
      }
    }

    const blob = await response.blob();
    const downloadUrl = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(downloadUrl);
  },
};

export const ticketsApi = {
  getStats: async (): Promise<TicketStats> => {
    const response = await apiClient.get('/admin/tickets/stats');
    return response.data;
  },

  list: async (params?: {
    page?: number;
    pageSize?: number;
    status?: string;
    priority?: string;
    category?: string;
    search?: string;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }): Promise<TicketsListResponse> => {
    const response = await apiClient.get('/admin/tickets', { params });
    return response.data;
  },

  getById: async (ticketId: string): Promise<TicketDetail> => {
    const response = await apiClient.get(`/admin/tickets/${ticketId}`);
    return response.data;
  },

  respond: async (ticketId: string, message: string, options?: {
    isInternalNote?: boolean;
    setStatus?: TicketStatus;
  }): Promise<{ success: boolean; response: TicketResponse }> => {
    const response = await apiClient.post(`/admin/tickets/${ticketId}/respond`, {
      message,
      ...options,
    });
    return response.data;
  },

  updateStatus: async (ticketId: string, status: TicketStatus): Promise<{ success: boolean; ticket: Ticket }> => {
    const response = await apiClient.patch(`/admin/tickets/${ticketId}/status`, { status });
    return response.data;
  },

  assign: async (ticketId: string, adminId?: string): Promise<{ success: boolean; ticket: Ticket }> => {
    const response = await apiClient.patch(`/admin/tickets/${ticketId}/assign`, { adminId });
    return response.data;
  },

  updatePriority: async (ticketId: string, priority: TicketPriority): Promise<{ success: boolean; ticket: Ticket }> => {
    const response = await apiClient.patch(`/admin/tickets/${ticketId}/priority`, { priority });
    return response.data;
  },
};

