import { useState, useEffect } from 'react';
import { clsx } from 'clsx';

interface DateTimePicker24hProps {
  label?: string;
  value: string; // "YYYY-MM-DDTHH:MM" format (local time)
  onChange: (e: { target: { value: string } }) => void;
}

export default function DateTimePicker24h({ label, value, onChange }: DateTimePicker24hProps) {
  // Parsing the initial value
  const initialParts = (value || '').split('T');
  const initialDate = initialParts[0] || '';
  const initialTime = initialParts[1] || '';
  const initialHours = initialTime.split(':')[0] || '';
  const initialMinutes = initialTime.split(':')[1] || '';

  // Local state for time inputs to allow unstable typing
  const [localHours, setLocalHours] = useState(initialHours);
  const [localMinutes, setLocalMinutes] = useState(initialMinutes);
  const [localDate, setLocalDate] = useState(initialDate);

  // Sync with prop when it changes externally
  useEffect(() => {
    const parts = (value || '').split('T');
    setLocalDate(parts[0] || '');
    const time = parts[1] || '';
    setLocalHours(time.split(':')[0] || '');
    setLocalMinutes(time.split(':')[1] || '');
  }, [value]);

  const inputClass = clsx(
    'px-3 py-2 border rounded-lg text-sm transition-colors',
    'focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent',
    'border-gray-300 bg-white hover:border-gray-400'
  );

  const emitChange = (date: string, h: string, m: string) => {
    // We only emit the change to the parent if we have a date
    if (date) {
      const formattedH = h.padStart(2, '0');
      const formattedM = m.padStart(2, '0');
      onChange({ target: { value: `${date}T${formattedH}:${formattedM}` } });
    }
  };

  const handleDateChange = (newDate: string) => {
    setLocalDate(newDate);
    emitChange(newDate, localHours || '00', localMinutes || '00');
  };

  const handleTimeBlur = (field: 'h' | 'm', val: string) => {
    let num = parseInt(val, 10);
    if (isNaN(num)) num = 0;

    if (field === 'h') {
      if (num > 23) num = 23;
      if (num < 0) num = 0;
      const finalH = num.toString().padStart(2, '0');
      setLocalHours(finalH);
      emitChange(localDate, finalH, localMinutes || '00');
    } else {
      if (num > 59) num = 59;
      if (num < 0) num = 0;
      const finalM = num.toString().padStart(2, '0');
      setLocalMinutes(finalM);
      emitChange(localDate, localHours || '00', finalM);
    }
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
          value={localDate}
          onChange={(e) => handleDateChange(e.target.value)}
          className={clsx(inputClass, 'flex-1')}
        />
        <div className="flex items-center gap-1">
          <input
            type="text"
            inputMode="numeric"
            value={localHours}
            placeholder="HH"
            maxLength={2}
            onChange={(e) => {
              const val = e.target.value.replace(/\D/g, '');
              setLocalHours(val);
              // Optimistically emit if it looks like a full hour
              if (val.length === 2 && localDate) {
                emitChange(localDate, val, localMinutes || '00');
              }
            }}
            onBlur={(e) => handleTimeBlur('h', e.target.value)}
            className={clsx(inputClass, 'w-14 text-center')}
          />
          <span className="text-gray-500 font-bold">:</span>
          <input
            type="text"
            inputMode="numeric"
            value={localMinutes}
            placeholder="MM"
            maxLength={2}
            onChange={(e) => {
              const val = e.target.value.replace(/\D/g, '');
              setLocalMinutes(val);
              // Optimistically emit if it looks like a full minute
              if (val.length === 2 && localDate) {
                emitChange(localDate, localHours || '00', val);
              }
            }}
            onBlur={(e) => handleTimeBlur('m', e.target.value)}
            className={clsx(inputClass, 'w-14 text-center')}
          />
        </div>
      </div>
    </div>
  );
}
