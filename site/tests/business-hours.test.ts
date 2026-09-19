import { describe, expect, it } from 'vitest';

import {
  detectMenuDevice,
  detectMenuOrigin,
  parseBusinessSchedule,
  resolveBusinessScheduleStatus,
} from '../app/api/_lib/business-hours';

const schedule = {
  timezone: 'America/Caracas',
  days: {
    monday: {
      open: true,
      ranges: [
        { start: '08:00', end: '12:00' },
        { start: '18:00', end: '23:00' },
      ],
    },
  },
};

describe('business hours', () => {
  it('parses multiple ranges per day', () => {
    const parsed = parseBusinessSchedule(schedule);
    expect(parsed.days.monday.ranges).toHaveLength(2);
  });

  it('stays closed outside configured ranges', () => {
    const mondayAfternoonUtc = new Date('2026-09-14T18:00:00Z');
    const status = resolveBusinessScheduleStatus(schedule, mondayAfternoonUtc);
    expect(status.configured).toBe(true);
    expect(status.isOpen).toBe(false);
    expect(status.caption).toContain('Cerrado');
  });

  it('reports the next close time while open', () => {
    const mondayMorningUtc = new Date('2026-09-14T13:30:00Z');
    const status = resolveBusinessScheduleStatus(schedule, mondayMorningUtc);
    expect(status.isOpen).toBe(true);
    expect(status.caption).toContain('Abierto hasta las');
    expect(status.closesAtLabel).toContain('p. m.');
  });

  it('treats 00:00-23:59 as open all day', () => {
    const allDay = {
      timezone: 'America/Caracas',
      days: {
        monday: { open: true, ranges: [{ start: '00:00', end: '23:59' }] },
      },
    };
    const status = resolveBusinessScheduleStatus(allDay, new Date('2026-09-14T16:00:00Z'));
    expect(status.isOpen).toBe(true);
    expect(status.closesAtLabel).toBe('24 horas');
    expect(status.caption).toContain('24 horas');
  });

  it('does not invent traffic origin', () => {
    expect(detectMenuOrigin('?src=qr', '')).toBe('qr');
    expect(detectMenuOrigin('', '')).toBe('direct');
    expect(detectMenuDevice('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)')).toBe('mobile');
  });
});
