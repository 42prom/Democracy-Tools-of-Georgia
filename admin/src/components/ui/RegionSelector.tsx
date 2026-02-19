import { X } from 'lucide-react';
import type { Region } from '../../types';

interface RegionSelectorProps {
  label?: string;
  regions: Region[];
  selectedRegionIds: string[]; // NOTE: Despite name, these should be region CODES, not UUIDs
  onChange: (selectedCodes: string[]) => void;
  helperText?: string;
}

export default function RegionSelector({
  label = 'Regions',
  regions,
  selectedRegionIds,
  onChange,
  helperText,
}: RegionSelectorProps) {
  const handleToggle = (code: string) => {
    if (selectedRegionIds.includes(code)) {
      onChange(selectedRegionIds.filter((rCode) => rCode !== code));
    } else {
      onChange([...selectedRegionIds, code]);
    }
  };

  const selectAll = () => {
    // Use region CODES, not UUIDs
    onChange(regions.map((r) => r.code));
  };

  const clearAll = () => {
    onChange([]);
  };

  // Match by CODE, not UUID
  const selectedRegions = regions.filter((r) => selectedRegionIds.includes(r.code));

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="block text-sm font-medium text-gray-700">
          {label}
        </label>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={selectAll}
            className="text-xs font-medium text-primary-600 hover:text-primary-700"
          >
            Select All
          </button>
          <span className="text-gray-300">|</span>
          <button
            type="button"
            onClick={clearAll}
            className="text-xs font-medium text-primary-600 hover:text-primary-700"
          >
            Clear All
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 min-h-[40px] p-2 border border-gray-300 rounded-lg bg-gray-50/50">
        {selectedRegions.length === 0 ? (
          <span className="text-sm text-gray-400 px-1 py-0.5 italic">
            No regions selected (matches all)
          </span>
        ) : (
          selectedRegions.map((region) => (
            <span
              key={region.id}
              className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-primary-100 text-primary-800 animate-in fade-in zoom-in duration-200"
            >
              {region.name_en}
              <button
                type="button"
                onClick={() => handleToggle(region.code)}
                className="ml-1.5 text-primary-600 hover:text-primary-800 focus:outline-none"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          ))
        )}
      </div>

      <div className="relative">
        <select
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white"
          value=""
          onChange={(e) => {
            const val = e.target.value;
            if (val) handleToggle(val);
          }}
        >
          <option value="">Add a region...</option>
          {regions
            .filter((r) => !selectedRegionIds.includes(r.code))
            .map((r) => (
              <option key={r.id} value={r.code}>
                {r.name_en} / {r.name_ka}
              </option>
            ))}
        </select>
      </div>

      {helperText && (
        <p className="text-xs text-gray-500 italic">{helperText}</p>
      )}
    </div>
  );
}
