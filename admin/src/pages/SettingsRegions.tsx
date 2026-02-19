import { useState, useEffect, useRef } from 'react';
import { MapPin, Plus, Edit, Trash2, Upload, Search, X } from 'lucide-react';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Modal from '../components/ui/Modal';
import { regionsApi } from '../api/client';
import type { Region, CreateRegionRequest } from '../types';

export default function SettingsRegions() {
  const [regions, setRegions] = useState<Region[]>([]);
  const [filteredRegions, setFilteredRegions] = useState<Region[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingRegion, setEditingRegion] = useState<Region | null>(null);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Form state
  const [formData, setFormData] = useState<CreateRegionRequest>({
    code: '',
    name_en: '',
    name_ka: '',
    parent_region_id: '',
    active: true,
  });

  useEffect(() => {
    loadRegions();
  }, []);

  useEffect(() => {
    // Filter regions based on search query
    if (!searchQuery.trim()) {
      setFilteredRegions(regions);
    } else {
      const query = searchQuery.toLowerCase();
      const filtered = regions.filter(
        (region) =>
          region.code.toLowerCase().includes(query) ||
          region.name_en.toLowerCase().includes(query) ||
          region.name_ka.includes(query)
      );
      setFilteredRegions(filtered);
    }
  }, [searchQuery, regions]);

  const loadRegions = async () => {
    setLoading(true);
    try {
      const data = await regionsApi.list();
      setRegions(data);
      setFilteredRegions(data);
    } catch (error) {
      console.error('Failed to load regions:', error);
      alert('Failed to load regions');
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = () => {
    setEditingRegion(null);
    setFormData({
      code: '',
      name_en: '',
      name_ka: '',
      parent_region_id: '',
      active: true,
    });
    setShowModal(true);
  };

  const handleEdit = (region: Region) => {
    setEditingRegion(region);
    setFormData({
      code: region.code,
      name_en: region.name_en,
      name_ka: region.name_ka,
      parent_region_id: region.parent_region_id || '',
      active: region.active,
    });
    setShowModal(true);
  };

  const handleDelete = async (region: Region) => {
    if (!confirm(`Are you sure you want to delete "${region.name_en}"?`)) {
      return;
    }

    try {
      await regionsApi.delete(region.id);
      setRegions(regions.filter((r) => r.id !== region.id));
      alert('Region deleted successfully');
    } catch (error) {
      console.error('Failed to delete region:', error);
      alert('Failed to delete region');
    }
  };

  const handleToggleActive = async (region: Region) => {
    try {
      const updated = await regionsApi.toggleActive(region.id, !region.active);
      setRegions(regions.map((r) => (r.id === region.id ? updated : r)));
    } catch (error) {
      console.error('Failed to toggle active:', error);
      alert('Failed to update region status');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validation
    if (!formData.code.trim() || !formData.name_en.trim() || !formData.name_ka.trim()) {
      alert('Please fill in all required fields');
      return;
    }

    try {
      if (editingRegion) {
        // Update existing
        const updated = await regionsApi.update(editingRegion.id, formData);
        setRegions(regions.map((r) => (r.id === editingRegion.id ? updated : r)));
        alert('Region updated successfully');
      } else {
        // Create new
        const created = await regionsApi.create(formData);
        setRegions([...regions, created]);
        alert('Region created successfully');
      }
      setShowModal(false);
    } catch (error) {
      console.error('Failed to save region:', error);
      alert('Failed to save region');
    }
  };

  const handleImportCSV = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImporting(true);
    try {
      const result = await regionsApi.importCSV(file);
      alert(`Import completed!\nImported: ${result.imported} regions\nErrors: ${result.errors.length}`);
      if (result.errors.length > 0) {
        console.error('Import errors:', result.errors);
      }
      await loadRegions();
    } catch (error) {
      console.error('Failed to import CSV:', error);
      alert('Failed to import CSV');
    } finally {
      setImporting(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Settings - Regions</h1>
          <p className="text-gray-600 mt-1">Manage available regions for polls</p>
        </div>
        <div className="h-64 bg-gray-200 rounded-lg animate-pulse" />
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Settings - Regions</h1>
        <p className="text-gray-600 mt-1">Manage available regions for polls</p>
      </div>

      {/* Actions Bar */}
      <div className="flex items-center gap-4 mb-6">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder="Search regions..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>
        <Button onClick={handleAdd}>
          <Plus className="w-4 h-4 mr-2" />
          Add Region
        </Button>
        <Button variant="secondary" onClick={handleImportCSV} disabled={importing}>
          <Upload className="w-4 h-4 mr-2" />
          {importing ? 'Importing...' : 'Import CSV'}
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv"
          onChange={handleFileChange}
          className="hidden"
        />
      </div>

      {/* Regions Table */}
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-3 px-4 text-sm font-semibold text-gray-900">
                  Code
                </th>
                <th className="text-left py-3 px-4 text-sm font-semibold text-gray-900">
                  Name (English)
                </th>
                <th className="text-left py-3 px-4 text-sm font-semibold text-gray-900">
                  Name (Georgian)
                </th>
                <th className="text-left py-3 px-4 text-sm font-semibold text-gray-900">
                  Parent Region
                </th>
                <th className="text-left py-3 px-4 text-sm font-semibold text-gray-900">
                  Status
                </th>
                <th className="text-right py-3 px-4 text-sm font-semibold text-gray-900">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredRegions.map((region) => (
                <tr key={region.id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="py-3 px-4 text-sm font-medium text-gray-900">
                    <div className="flex items-center">
                      <MapPin className="w-4 h-4 text-gray-400 mr-2" />
                      {region.code}
                    </div>
                  </td>
                  <td className="py-3 px-4 text-sm text-gray-700">{region.name_en}</td>
                  <td className="py-3 px-4 text-sm text-gray-700">{region.name_ka}</td>
                  <td className="py-3 px-4 text-sm text-gray-500">
                    {region.parent_region_id || '-'}
                  </td>
                  <td className="py-3 px-4">
                    <button
                      onClick={() => handleToggleActive(region)}
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        region.active
                          ? 'bg-green-100 text-green-800'
                          : 'bg-gray-100 text-gray-800'
                      }`}
                    >
                      {region.active ? 'Active' : 'Inactive'}
                    </button>
                  </td>
                  <td className="py-3 px-4">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => handleEdit(region)}
                        className="p-1 text-gray-600 hover:text-primary-600"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(region)}
                        className="p-1 text-gray-600 hover:text-red-600"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {filteredRegions.length === 0 && (
          <div className="text-center py-12">
            <p className="text-gray-500">
              {searchQuery ? 'No regions match your search' : 'No regions configured'}
            </p>
          </div>
        )}
      </Card>

      {/* Add/Edit Modal */}
      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title={editingRegion ? 'Edit Region' : 'Add Region'}
        icon={<MapPin className="w-5 h-5" />}
        footer={
          <>
            <Button type="button" variant="secondary" onClick={() => setShowModal(false)}>
              Cancel
            </Button>
            <Button onClick={(e) => handleSubmit(e as any)}>{editingRegion ? 'Update' : 'Create'}</Button>
          </>
        }
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="Region Code"
            placeholder="e.g., reg_tbilisi"
            value={formData.code}
            onChange={(e) => setFormData({ ...formData, code: e.target.value })}
            required
          />

          <Input
            label="Name (English)"
            placeholder="e.g., Tbilisi"
            value={formData.name_en}
            onChange={(e) => setFormData({ ...formData, name_en: e.target.value })}
            required
          />

          <Input
            label="Name (Georgian)"
            placeholder="e.g., თბილისი"
            value={formData.name_ka}
            onChange={(e) => setFormData({ ...formData, name_ka: e.target.value })}
            required
          />

          <Input
            label="Parent Region ID (optional)"
            placeholder="e.g., parent_region_id"
            value={formData.parent_region_id}
            onChange={(e) => setFormData({ ...formData, parent_region_id: e.target.value })}
          />

          <div className="flex items-center">
            <input
              type="checkbox"
              id="active"
              checked={formData.active}
              onChange={(e) => setFormData({ ...formData, active: e.target.checked })}
              className="w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
            />
            <label htmlFor="active" className="ml-2 text-sm font-medium text-gray-700">
              Active
            </label>
          </div>
        </form>
      </Modal>
    </div>
  );
}
