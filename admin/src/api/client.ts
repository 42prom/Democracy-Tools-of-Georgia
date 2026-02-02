import axios from 'axios';
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
} from '../types';

const apiClient = axios.create({
  baseURL: '/api/v1',
  headers: {
    'Content-Type': 'application/json',
  },
});

// Admin authentication (mock for Phase 0)
apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('admin_token') ?? localStorage.getItem('adminToken');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

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
    const response = await apiClient.get(`/analytics/polls/${pollId}/results`, {
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
    return response.data.message;
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
};
