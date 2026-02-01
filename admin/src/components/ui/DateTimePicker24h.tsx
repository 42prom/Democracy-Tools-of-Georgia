import { clsx } from 'clsx';

interface DateTimePicker24hProps {
  label?: string;
  value: string; // "YYYY-MM-DDTHH:MM" format
  onChange: (e: { target: { value: string } }) => void;
}

export default function DateTimePicker24h({ label, value, onChange }: DateTimePicker24hProps) {
  // Parse value into date and time parts
  const [datePart, timePart] = (value || '').split('T');
  const [hours, minutes] = (timePart || '').split(':');

  const inputClass = clsx(
    'px-3 py-2 border rounded-lg text-sm transition-colors',
    'focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent',
    'border-gray-300 bg-white hover:border-gray-400'
  );

  const emitChange = (newDate: string, newHours: string, newMinutes: string) => {
    if (!newDate) {
      onChange({ target: { value: '' } });
      return;
    }
    const h = newHours.padStart(2, '0');
    const m = newMinutes.padStart(2, '0');
    onChange({ target: { value: `${newDate}T${h}:${m}` } });
  };

  return (
    <div className="w-full">
      {label && (
        <label className="block text-sm font-medium text-gray-700 mb-1.5">
          {label}
        </label>
      )}
      <div className="flex items-center gap-2">
        <input
          type="date"
          value={datePart || ''}
          onChange={(e) => emitChange(e.target.value, hours || '00', minutes || '00')}
          className={clsx(inputClass, 'flex-1')}
        />
        <div className="flex items-center gap-1">
          <input
            type="number"
            min={0}
            max={23}
            value={hours || ''}
            placeholder="HH"
            onChange={(e) => {
              let val = parseInt(e.target.value);
              if (isNaN(val)) val = 0;
              if (val > 23) val = 23;
              if (val < 0) val = 0;
              emitChange(datePart || '', val.toString(), minutes || '00');
            }}
            className={clsx(inputClass, 'w-16 text-center')}
          />
          <span className="text-gray-500 font-bold">:</span>
          <input
            type="number"
            min={0}
            max={59}
            value={minutes || ''}
            placeholder="MM"
            onChange={(e) => {
              let val = parseInt(e.target.value);
              if (isNaN(val)) val = 0;
              if (val > 59) val = 59;
              if (val < 0) val = 0;
              emitChange(datePart || '', hours || '00', val.toString());
            }}
            className={clsx(inputClass, 'w-16 text-center')}
          />
        </div>
      </div>
    </div>
  );
}
