import { useState, useEffect } from 'react';
import { Download, FileSpreadsheet, AlertCircle, CheckCircle, Loader2, Calendar, Shield } from 'lucide-react';
import Modal from './ui/Modal';
import { auditExportApi, AuditExportPreview, AuditExportOptions } from '../api/client';

interface AuditExportModalProps {
  pollId: string;
  pollTitle: string;
  isOpen: boolean;
  onClose: () => void;
}

type ExportStatus = 'idle' | 'loading-preview' | 'ready' | 'exporting' | 'success' | 'error';

export default function AuditExportModal({ pollId, pollTitle, isOpen, onClose }: AuditExportModalProps) {
  const [status, setStatus] = useState<ExportStatus>('idle');
  const [preview, setPreview] = useState<AuditExportPreview | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Export options
  const [includeVoteLevelData, setIncludeVoteLevelData] = useState(true);
  const [anonymizeVoters, setAnonymizeVoters] = useState(false);
  const [useDateRange, setUseDateRange] = useState(false);
  const [dateRangeStart, setDateRangeStart] = useState('');
  const [dateRangeEnd, setDateRangeEnd] = useState('');

  // Load preview when modal opens
  useEffect(() => {
    if (isOpen && pollId) {
      loadPreview();
    }
  }, [isOpen, pollId]);

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setStatus('idle');
      setPreview(null);
      setError(null);
    }
  }, [isOpen]);

  const loadPreview = async () => {
    setStatus('loading-preview');
    setError(null);

    try {
      const data = await auditExportApi.getPreview(pollId);
      setPreview(data);
      setStatus('ready');
    } catch (err: any) {
      setError(err.message || 'Failed to load export preview');
      setStatus('error');
    }
  };

  const handleExport = async () => {
    setStatus('exporting');
    setError(null);

    try {
      const options: AuditExportOptions = {
        includeVoteLevelData,
        anonymizeVoters,
      };

      if (useDateRange) {
        if (dateRangeStart) options.dateRangeStart = dateRangeStart;
        if (dateRangeEnd) options.dateRangeEnd = dateRangeEnd;
      }

      // Use streaming for large exports (>10000 votes)
      const isLargeExport = preview && preview.statistics.totalVotes > 10000;

      if (isLargeExport) {
        await auditExportApi.downloadStreamedCsv(pollId, options);
      } else {
        await auditExportApi.downloadCsv(pollId, options);
      }

      setStatus('success');
      setTimeout(() => {
        onClose();
      }, 1500);
    } catch (err: any) {
      setError(err.message || 'Export failed');
      setStatus('error');
    }
  };

  if (!isOpen) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Export Audit Data"
      icon={<FileSpreadsheet className="w-5 h-5" />}
      maxWidth="lg"
      footer={
        (status === 'ready' && preview) && (
          <>
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleExport}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-lg transition-colors"
            >
              <Download className="w-4 h-4" />
              Export CSV
            </button>
          </>
        )
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-gray-500 truncate max-w-full -mt-2 mb-4">{pollTitle}</p>

        {status === 'loading-preview' && (
          <div className="flex flex-col items-center justify-center py-8">
            <Loader2 className="w-8 h-8 text-primary-600 animate-spin mb-3" />
            <p className="text-gray-600">Loading export preview...</p>
          </div>
        )}

        {status === 'error' && (
          <div className="flex flex-col items-center justify-center py-8">
            <div className="p-3 bg-red-100 rounded-full mb-3">
              <AlertCircle className="w-6 h-6 text-red-600" />
            </div>
            <p className="text-red-600 font-medium mb-2">Export Error</p>
            <p className="text-gray-600 text-sm text-center">{error}</p>
            <button
              onClick={loadPreview}
              className="mt-4 px-4 py-2 text-sm font-medium text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"
            >
              Try Again
            </button>
          </div>
        )}

        {status === 'success' && (
          <div className="flex flex-col items-center justify-center py-8">
            <div className="p-3 bg-green-100 rounded-full mb-3">
              <CheckCircle className="w-6 h-6 text-green-600" />
            </div>
            <p className="text-green-600 font-medium">Export Complete!</p>
            <p className="text-gray-500 text-sm mt-1">File downloaded successfully</p>
          </div>
        )}

        {status === 'exporting' && (
          <div className="flex flex-col items-center justify-center py-8">
            <Loader2 className="w-8 h-8 text-primary-600 animate-spin mb-3" />
            <p className="text-gray-600">Generating export...</p>
            <p className="text-gray-400 text-sm mt-1">This may take a moment for large datasets</p>
          </div>
        )}

        {(status === 'ready' && preview) && (
          <>
            {/* Statistics */}
            <div className="bg-gray-50 rounded-lg p-4 mb-4">
              <h3 className="text-sm font-medium text-gray-700 mb-3">Export Statistics</h3>
              <div className="grid grid-cols-3 gap-4 text-center">
                <div>
                  <p className="text-2xl font-bold text-gray-900">
                    {preview.statistics.totalVotes.toLocaleString()}
                  </p>
                  <p className="text-xs text-gray-500">Total Votes</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-gray-900">
                    {preview.statistics.totalParticipants.toLocaleString()}
                  </p>
                  <p className="text-xs text-gray-500">Participants</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-gray-900">
                    {preview.statistics.optionsCount}
                  </p>
                  <p className="text-xs text-gray-500">Options</p>
                </div>
              </div>
            </div>

            {/* Export Options */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-gray-700">Export Options</h3>

              {/* Include Vote-Level Data */}
              <label className="flex items-start gap-3 p-3 border border-gray-200 rounded-lg hover:border-primary-300 cursor-pointer transition-colors">
                <input
                  type="checkbox"
                  checked={includeVoteLevelData}
                  onChange={(e) => setIncludeVoteLevelData(e.target.checked)}
                  className="mt-0.5 w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                />
                <div>
                  <p className="text-sm font-medium text-gray-900">Include Individual Vote Records</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {preview.exportOptions.includeVoteLevelData.description}
                  </p>
                </div>
              </label>

              {/* Anonymize Voters */}
              <label className="flex items-start gap-3 p-3 border border-gray-200 rounded-lg hover:border-primary-300 cursor-pointer transition-colors">
                <input
                  type="checkbox"
                  checked={anonymizeVoters}
                  onChange={(e) => setAnonymizeVoters(e.target.checked)}
                  className="mt-0.5 w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                />
                <div>
                  <p className="text-sm font-medium text-gray-900">Anonymize Vote IDs</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {preview.exportOptions.anonymizeVoters.description}
                  </p>
                </div>
              </label>

              {/* Date Range Filter */}
              <div className="p-3 border border-gray-200 rounded-lg">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={useDateRange}
                    onChange={(e) => setUseDateRange(e.target.checked)}
                    className="w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                  />
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-gray-400" />
                    <span className="text-sm font-medium text-gray-900">Filter by Date Range</span>
                  </div>
                </label>

                {useDateRange && (
                  <div className="mt-3 grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Start Date</label>
                      <input
                        type="date"
                        value={dateRangeStart}
                        onChange={(e) => setDateRangeStart(e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">End Date</label>
                      <input
                        type="date"
                        value={dateRangeEnd}
                        onChange={(e) => setDateRangeEnd(e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Security Notice */}
            <div className="mt-4 flex items-start gap-2 p-3 bg-blue-50 rounded-lg">
              <Shield className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
              <p className="text-xs text-blue-700">
                This export will be logged for audit purposes. The CSV includes a tamper-proof SHA-256 hash of the dataset.
              </p>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
