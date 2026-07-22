import React, { useState, useRef, useEffect } from 'react';
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react';

const THAI_MONTHS = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'
];

export default function MonthPicker({ value, onChange }) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef(null);

  // Parse YYYY-MM
  const [year, month] = value ? value.split('-').map(Number) : [new Date().getFullYear(), new Date().getMonth() + 1];
  const [currentYear, setCurrentYear] = useState(year);

  useEffect(() => {
    if (value) {
      const [y] = value.split('-').map(Number);
      setCurrentYear(y);
    }
  }, [value]);

  useEffect(() => {
    function handleClickOutside(event) {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleMonthClick = (mIndex) => {
    const formattedMonth = String(mIndex + 1).padStart(2, '0');
    onChange(`${currentYear}-${formattedMonth}`);
    setIsOpen(false);
  };

  const getLabel = () => {
    if (!value) return '';
    const [y, m] = value.split('-').map(Number);
    return `${THAI_MONTHS[m - 1]} ${y + 543}`;
  };

  return (
    <div className="custom-month-picker" ref={containerRef} style={{ position: 'relative', display: 'inline-block', width: '220px' }}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          width: '100%',
          minHeight: '46px',
          border: '1px solid #cbd5e1',
          borderRadius: '12px',
          padding: '8px 14px',
          background: 'white',
          color: '#1e293b',
          fontSize: '14px',
          fontWeight: '600',
          cursor: 'pointer',
          boxShadow: '0 1px 2px rgba(0, 0, 0, 0.05)',
          outline: 'none',
          transition: 'all 0.15s ease',
          textAlign: 'left'
        }}
      >
        <span>{getLabel()}</span>
        <Calendar size={16} style={{ color: '#64748b', marginLeft: '8px' }} />
      </button>

      {isOpen && (
        <div style={{
          position: 'absolute',
          top: 'calc(100% + 6px)',
          right: 0,
          width: '280px',
          background: 'white',
          border: '1px solid #e2e8f0',
          borderRadius: '16px',
          boxShadow: '0 12px 30px rgba(15,23,42,0.12)',
          padding: '14px',
          zIndex: 9999
        }}>
          {/* Header with year navigation */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
            <button
              type="button"
              onClick={() => setCurrentYear(prev => prev - 1)}
              style={{ border: 0, background: 'transparent', padding: '6px', color: '#64748b', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
            >
              <ChevronLeft size={18} />
            </button>
            <strong style={{ fontSize: '15px', color: '#1e293b' }}>พ.ศ. {currentYear + 543}</strong>
            <button
              type="button"
              onClick={() => setCurrentYear(prev => prev + 1)}
              style={{ border: 0, background: 'transparent', padding: '6px', color: '#64748b', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
            >
              <ChevronRight size={18} />
            </button>
          </div>

          {/* Grid of Months */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
            {THAI_MONTHS.map((mName, idx) => {
              const isSelected = value === `${currentYear}-${String(idx + 1).padStart(2, '0')}`;
              return (
                <button
                  key={mName}
                  type="button"
                  onClick={() => handleMonthClick(idx)}
                  style={{
                    padding: '8px 4px',
                    borderRadius: '10px',
                    border: '1px solid',
                    borderColor: isSelected ? '#1d4ed8' : 'transparent',
                    background: isSelected ? '#eff6ff' : 'transparent',
                    color: isSelected ? '#1d4ed8' : '#475569',
                    fontWeight: isSelected ? '700' : '500',
                    fontSize: '12.5px',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease'
                  }}
                  onMouseEnter={(e) => {
                    if (!isSelected) {
                      e.currentTarget.style.background = '#f1f5f9';
                      e.currentTarget.style.color = '#1e293b';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isSelected) {
                      e.currentTarget.style.background = 'transparent';
                      e.currentTarget.style.color = '#475569';
                    }
                  }}
                >
                  {mName.slice(0, 3)}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
