import { useState, useEffect } from 'react';
import { Users, Search, Download, Upload, X, Eye, Filter } from 'lucide-react';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import { profilesApi } from '../api/client';
import type { UserProfile, ProfileFilters } from '../types';

export default function Profiles() {
  const [profiles, setProfiles] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [totalPages, setTotalPages] = useState(1);
  const [searchQuery, setSearchQuery] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [selectedProfile, setSelectedProfile] = useState<UserProfile | null>(null);
  const [participationRecords, setParticipationRecords] = useState<any[]>([]);
  const [participationMetadata, setParticipationMetadata] = useState<any>(null);
  const [loadingParticipation, setLoadingParticipation] = useState(false);
  const [editingRegion, setEditingRegion] = useState(false);
  const [selectedRegion, setSelectedRegion] = useState<string>('');
  const [updatingRegion, setUpdatingRegion] = useState(false);
  const [availableRegions] = useState([
    { code: 'reg_tbilisi', name: 'Tbilisi' },
    { code: 'reg_batumi', name: 'Batumi' },
    { code: 'reg_kutaisi', name: 'Kutaisi' },
    { code: 'reg_rustavi', name: 'Rustavi' },
    { code: 'reg_gori', name: 'Gori' },
    { code: 'reg_zugdidi', name: 'Zugdidi' },
    { code: 'reg_poti', name: 'Poti' },
    { code: 'reg_telavi', name: 'Telavi' },
    { code: 'reg_kobuleti', name: 'Kobuleti' },
  ]);

  // Filter state
  const [filters, setFilters] = useState<ProfileFilters>({
    search: '',
    ageBucket: undefined,
    genderBucket: undefined,
    regionBucket: undefined,
    lastLoginStart: undefined,
    lastLoginEnd: undefined,
  });

  useEffect(() => {
    loadProfiles();
  }, [page, filters]);

  const loadProfiles = async () => {
    setLoading(true);
    try {
      const response = await profilesApi.list({
        filters,
        page,
        pageSize,
        sortBy: 'enrolledAt',
        sortOrder: 'desc',
      });
      setProfiles(response.profiles);
      setTotalCount(response.total);
      setTotalPages(response.totalPages);
    } catch (error) {
      console.error('Failed to load profiles:', error);
      alert('Failed to load profiles');
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = () => {
    setFilters({ ...filters, search: searchQuery });
    setPage(1);
  };

  const handleClearFilters = () => {
    setSearchQuery('');
    setFilters({
      search: '',
      ageBucket: undefined,
      genderBucket: undefined,
      regionBucket: undefined,
      lastLoginStart: undefined,
      lastLoginEnd: undefined,
    });
    setPage(1);
  };

  const handleExportAggregated = async () => {
    setExporting(true);
    try {
      // Use the CSV export endpoint with auth header
      const token = localStorage.getItem('admin_token') ?? localStorage.getItem('adminToken');
      const response = await fetch('/api/v1/admin/export/users.csv', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `users-export-${new Date().toISOString().split('T')[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (error) {
      console.error('Failed to export:', error);
      alert('Failed to export data.');
    } finally {
      setExporting(false);
    }
  };

  const handleExportProfileList = async () => {
    if (!confirm('Profile list export is a restricted operation and will be audit-logged. Continue?')) {
      return;
    }

    setExporting(true);
    try {
      // Use the CSV export endpoint with auth header
      const token = localStorage.getItem('admin_token') ?? localStorage.getItem('adminToken');
      const response = await fetch('/api/v1/admin/export/users.csv', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `users-export-restricted-${new Date().toISOString().split('T')[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (error) {
      console.error('Failed to export:', error);
      alert('Failed to export profile list.');
    } finally {
      setExporting(false);
    }
  };

  const handleImport = () => {
    // Create a hidden file input
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.csv';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      try {
        // TODO: Implement CSV import API endpoint
        alert('Import functionality will be implemented in Phase 1. File selected: ' + file.name);
      } catch (error) {
        console.error('Failed to import:', error);
        alert('Failed to import profiles');
      }
    };
    input.click();
  };

  const handleViewParticipation = async (profile: UserProfile) => {
    setSelectedProfile(profile);
    setSelectedRegion(profile.regionBucket || '');
    setEditingRegion(false);
    setLoadingParticipation(true);
    try {
      const response = await profilesApi.getParticipation(profile.id);
      // Response now includes metadata and participationRecords
      if (response.metadata) {
        setParticipationMetadata(response.metadata);
        setParticipationRecords(response.participationRecords || []);
      } else {
        // Fallback for old format (just array)
        setParticipationRecords(Array.isArray(response) ? response : []);
        setParticipationMetadata(null);
      }
    } catch (error) {
      console.error('Failed to load participation:', error);
      alert('Failed to load participation records. This requires profiles.audit permission.');
    } finally {
      setLoadingParticipation(false);
    }
  };

  const handleSaveRegion = async () => {
    if (!selectedProfile || !selectedRegion) return;

    setUpdatingRegion(true);
    try {
      // Call API to update region using profilesApi (which has auth interceptor)
      await profilesApi.updateRegion(selectedProfile.id, selectedRegion);
      
      // Update local state
      setSelectedProfile({ ...selectedProfile, regionBucket: selectedRegion });
      setEditingRegion(false);
      alert('Region updated successfully');

      // Reload profiles to reflect changes
      loadProfiles();
    } catch (error) {
      console.error('Failed to update region:', error);
      alert('Failed to update region');
    } finally {
      setUpdatingRegion(false);
    }
  };

  if (loading && page === 1) {
    return (
      <div className="p-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Registered Profiles</h1>
          <p className="text-gray-600 mt-1">Manage and monitor registered users</p>
        </div>
        <div className="h-64 bg-gray-200 rounded-lg animate-pulse" />
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Registered Profiles</h1>
        <p className="text-gray-600 mt-1">Manage and monitor registered users (PN masked by default)</p>
      </div>

      {/* Search and Actions Bar */}
      <div className="mb-6 space-y-4">
        <div className="flex items-center gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search by personal number or name/surname..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
            {searchQuery && (
              <button
                onClick={() => {
                  setSearchQuery('');
                  setFilters({ ...filters, search: '' });
                }}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>
          <Button onClick={handleSearch}>
            <Search className="w-4 h-4 mr-2" />
            Search
          </Button>
          <Button variant="secondary" onClick={() => setShowFilters(!showFilters)}>
            <Filter className="w-4 h-4 mr-2" />
            Filters
          </Button>
        </div>

        {/* Advanced Filters */}
        {showFilters && (
          <Card>
            <div className="p-4 space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Age Bucket
                  </label>
                  <select
                    value={filters.ageBucket || ''}
                    onChange={(e) => setFilters({ ...filters, ageBucket: e.target.value || undefined })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                  >
                    <option value="">All Ages</option>
                    <option value="18-24">18-24</option>
                    <option value="25-34">25-34</option>
                    <option value="35-44">35-44</option>
                    <option value="45-54">45-54</option>
                    <option value="55-64">55-64</option>
                    <option value="65+">65+</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Gender
                  </label>
                  <select
                    value={filters.genderBucket || ''}
                    onChange={(e) => setFilters({ ...filters, genderBucket: e.target.value as any || undefined })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                  >
                    <option value="">All Genders</option>
                    <option value="M">Male</option>
                    <option value="F">Female</option>
                    <option value="Other">Other</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Region
                  </label>
                  <input
                    type="text"
                    placeholder="e.g., reg_tbilisi"
                    value={filters.regionBucket || ''}
                    onChange={(e) => setFilters({ ...filters, regionBucket: e.target.value || undefined })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Last Login From
                  </label>
                  <input
                    type="date"
                    value={filters.lastLoginStart || ''}
                    onChange={(e) => setFilters({ ...filters, lastLoginStart: e.target.value || undefined })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Last Login To
                  </label>
                  <input
                    type="date"
                    value={filters.lastLoginEnd || ''}
                    onChange={(e) => setFilters({ ...filters, lastLoginEnd: e.target.value || undefined })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>
              </div>

              <div className="flex gap-3">
                <Button onClick={() => { setPage(1); loadProfiles(); }}>
                  Apply Filters
                </Button>
                <Button variant="secondary" onClick={handleClearFilters}>
                  Clear All
                </Button>
              </div>
            </div>
          </Card>
        )}

        {/* Export Actions */}
        <div className="flex items-center justify-between">
          <div className="text-sm text-gray-600">
            Showing {profiles.length} of {totalCount} profiles
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={handleImport}>
              <Upload className="w-4 h-4 mr-2" />
              Import
            </Button>
            <Button variant="secondary" onClick={handleExportAggregated} disabled={exporting}>
              <Download className="w-4 h-4 mr-2" />
              Export Aggregated
            </Button>
            <Button variant="secondary" onClick={handleExportProfileList} disabled={exporting}>
              <Download className="w-4 h-4 mr-2" />
              Export Profile List (Restricted)
            </Button>
          </div>
        </div>
      </div>

      {/* Profiles Table */}
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-3 px-4 text-sm font-semibold text-gray-900">
                  Personal Number (Masked)
                </th>
                <th className="text-left py-3 px-4 text-sm font-semibold text-gray-900">
                  Name
                </th>
                <th className="text-left py-3 px-4 text-sm font-semibold text-gray-900">
                  Surname
                </th>
                <th className="text-left py-3 px-4 text-sm font-semibold text-gray-900">
                  Age
                </th>
                <th className="text-left py-3 px-4 text-sm font-semibold text-gray-900">
                  Gender
                </th>
                <th className="text-left py-3 px-4 text-sm font-semibold text-gray-900">
                  Region
                </th>
                <th className="text-right py-3 px-4 text-sm font-semibold text-gray-900">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {profiles.map((profile) => (
                <tr key={profile.id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="py-3 px-4 text-sm font-mono text-gray-900">
                    <div className="flex items-center">
                      <Users className="w-4 h-4 text-gray-400 mr-2" />
                      {profile.personalNumberMasked || '••••••••••••'}
                    </div>
                  </td>
                  <td className="py-3 px-4 text-sm text-gray-700">
                    {profile.name || '-'}
                  </td>
                  <td className="py-3 px-4 text-sm text-gray-700">
                    {profile.surname || '-'}
                  </td>
                  <td className="py-3 px-4 text-sm text-gray-700">{profile.ageBucket}</td>
                  <td className="py-3 px-4 text-sm text-gray-700">{profile.genderBucket}</td>
                  <td className="py-3 px-4 text-sm text-gray-700">{profile.regionBucket}</td>
                  <td className="py-3 px-4">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => handleViewParticipation(profile)}
                        className="p-1 text-gray-600 hover:text-primary-600"
                        title="View participation details"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {profiles.length === 0 && (
          <div className="text-center py-12">
            <p className="text-gray-500">No profiles found matching your criteria</p>
          </div>
        )}
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-center gap-2">
          <Button
            variant="secondary"
            onClick={() => setPage(page - 1)}
            disabled={page === 1}
          >
            Previous
          </Button>
          <span className="text-sm text-gray-600">
            Page {page} of {totalPages}
          </span>
          <Button
            variant="secondary"
            onClick={() => setPage(page + 1)}
            disabled={page === totalPages}
          >
            Next
          </Button>
        </div>
      )}

      {/* Participation Modal */}
      {selectedProfile && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-2xl max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-gray-900">
                Participation Details
              </h2>
              <button
                onClick={() => {
                  setSelectedProfile(null);
                  setParticipationRecords([]);
                  setParticipationMetadata(null);
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {loadingParticipation ? (
              <div className="py-8 text-center text-gray-500">Loading...</div>
            ) : (
              <div className="space-y-4">
                {/* Profile Metadata */}
                <div className="bg-gray-50 rounded-lg p-4 space-y-2">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs text-gray-500">Personal Number</p>
                      <p className="text-sm font-mono text-gray-900">
                        {selectedProfile.personalNumberMasked || '••••••••••••'}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Full Name</p>
                      <p className="text-sm text-gray-900">
                        {selectedProfile.name && selectedProfile.surname
                          ? `${selectedProfile.name} ${selectedProfile.surname}`
                          : '-'}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Status</p>
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          selectedProfile.status === 'active'
                            ? 'bg-green-100 text-green-800'
                            : 'bg-red-100 text-red-800'
                        }`}
                      >
                        {selectedProfile.status}
                      </span>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Notifications</p>
                      <p className="text-sm text-gray-900">
                        {participationMetadata?.notificationsEnabled !== undefined
                          ? participationMetadata.notificationsEnabled
                            ? 'Enabled'
                            : 'Disabled'
                          : selectedProfile.notificationsEnabled
                          ? 'Enabled'
                          : 'Disabled'}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Enrolled At</p>
                      <p className="text-sm text-gray-900">
                        {participationMetadata?.enrolledAt
                          ? new Date(participationMetadata.enrolledAt).toLocaleString(undefined, { hour12: false })
                          : selectedProfile.enrolledAt
                          ? new Date(selectedProfile.enrolledAt).toLocaleString(undefined, { hour12: false })
                          : '-'}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Last Login</p>
                      <p className="text-sm text-gray-900">
                        {participationMetadata?.lastLoginAt
                          ? new Date(participationMetadata.lastLoginAt).toLocaleString(undefined, { hour12: false })
                          : selectedProfile.lastLoginAt
                          ? new Date(selectedProfile.lastLoginAt).toLocaleString(undefined, { hour12: false })
                          : 'Never'}
                      </p>
                    </div>
                    <div className="col-span-2">
                      <div className="flex items-center justify-between">
                        <p className="text-xs text-gray-500">Region</p>
                        {!editingRegion && (
                          <button
                            onClick={() => setEditingRegion(true)}
                            className="text-xs text-primary-600 hover:text-primary-700"
                          >
                            Change
                          </button>
                        )}
                      </div>
                      {editingRegion ? (
                        <div className="flex gap-2 mt-1">
                          <select
                            value={selectedRegion}
                            onChange={(e) => setSelectedRegion(e.target.value)}
                            className="flex-1 px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-primary-500"
                            disabled={updatingRegion}
                          >
                            {availableRegions.map((region) => (
                              <option key={region.code} value={region.code}>
                                {region.name}
                              </option>
                            ))}
                          </select>
                          <button
                            onClick={handleSaveRegion}
                            disabled={updatingRegion}
                            className="px-3 py-1 text-xs bg-primary-600 text-white rounded hover:bg-primary-700 disabled:opacity-50"
                          >
                            {updatingRegion ? 'Saving...' : 'Save'}
                          </button>
                          <button
                            onClick={() => {
                              setEditingRegion(false);
                              setSelectedRegion(selectedProfile.regionBucket || '');
                            }}
                            disabled={updatingRegion}
                            className="px-3 py-1 text-xs border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <p className="text-sm text-gray-900 mt-1">
                          {availableRegions.find((r) => r.code === selectedProfile.regionBucket)?.name ||
                            selectedProfile.regionBucket ||
                            '-'}
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Participation Records */}
                <div>
                  <h3 className="text-sm font-semibold text-gray-900 mb-2">Poll Participation</h3>
                  {participationRecords.length === 0 ? (
                    <p className="text-center text-gray-500 py-8">No participation records found</p>
                  ) : (
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-gray-200">
                          <th className="text-left py-2 px-3 text-sm font-semibold text-gray-900">
                            Poll
                          </th>
                          <th className="text-left py-2 px-3 text-sm font-semibold text-gray-900">
                            Participated
                          </th>
                          <th className="text-left py-2 px-3 text-sm font-semibold text-gray-900">
                            Date
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {participationRecords.map((record, idx) => (
                          <tr key={idx} className="border-b border-gray-100">
                            <td className="py-2 px-3 text-sm text-gray-700">{record.pollTitle}</td>
                            <td className="py-2 px-3 text-sm">
                              <span
                                className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                  record.participated
                                    ? 'bg-green-100 text-green-800'
                                    : 'bg-gray-100 text-gray-800'
                                }`}
                              >
                                {record.participated ? 'YES' : 'NO'}
                              </span>
                            </td>
                            <td className="py-2 px-3 text-sm text-gray-500">
                              {record.participationDate
                                ? new Date(record.participationDate).toLocaleDateString()
                                : '-'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>

                <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                  <p className="text-xs text-yellow-800">
                    ⚠️ Privacy Notice: This view shows participation status only (YES/NO).
                    Vote choices are never displayed to maintain voter privacy.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
