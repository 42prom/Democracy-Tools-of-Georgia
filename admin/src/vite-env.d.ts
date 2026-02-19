/// <reference types="vite/client" />

interface ImportMetaEnv {
  // API Configuration (TASK-P2-ADM-01, TASK-P2-ADM-02)
  readonly VITE_API_BASE_URL?: string;  // Configurable API base URL (e.g., https://api.example.com/api/v1)
  readonly VITE_API_URL?: string;       // Legacy alias for VITE_API_BASE_URL
  readonly VITE_API_TIMEOUT?: string;   // Request timeout in ms (default: 15000)
  readonly VITE_API_MAX_RETRIES?: string; // Max retry attempts for GET requests (default: 3)
  readonly VITE_API_RETRY_DELAY?: string; // Base retry delay in ms (default: 1000)

  // App
  readonly VITE_APP_TITLE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
