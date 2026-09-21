class BusinessHoursRange {
  const BusinessHoursRange({required this.start, required this.end});

  final String start;
  final String end;

  int get startMinutes => _parseMinutes(start);
  int get endMinutes => _parseMinutes(end);

  bool contains(int minutes) {
    if (startMinutes <= endMinutes) {
      return minutes >= startMinutes && minutes < endMinutes;
    }
    return minutes >= startMinutes || minutes < endMinutes;
  }

  Map<String, dynamic> toMap() => {'start': start, 'end': end};

  factory BusinessHoursRange.fromMap(Map<String, dynamic> map) {
    return BusinessHoursRange(
      start: _normalizeHm(map['start']),
      end: _normalizeHm(map['end']),
    );
  }

  static int _parseMinutes(String value) {
    final parts = value.split(':');
    final hour = int.tryParse(parts.isNotEmpty ? parts[0] : '') ?? 0;
    final minute = int.tryParse(parts.length > 1 ? parts[1] : '') ?? 0;
    return hour * 60 + minute;
  }

  static String _normalizeHm(dynamic value) {
    final raw = value?.toString().trim() ?? '';
    final match = RegExp(r'^(\d{1,2}):(\d{2})').firstMatch(raw);
    if (match == null) return '08:00';
    final hour = (int.tryParse(match.group(1)!) ?? 8).clamp(0, 23);
    final minute = (int.tryParse(match.group(2)!) ?? 0).clamp(0, 59);
    return '${hour.toString().padLeft(2, '0')}:${minute.toString().padLeft(2, '0')}';
  }
}

class BusinessDaySchedule {
  const BusinessDaySchedule({
    required this.open,
    this.ranges = const <BusinessHoursRange>[],
  });

  final bool open;
  final List<BusinessHoursRange> ranges;

  Map<String, dynamic> toMap() => {
        'open': open,
        'ranges': ranges.map((range) => range.toMap()).toList(growable: false),
      };

  factory BusinessDaySchedule.fromMap(Map<String, dynamic>? map) {
    if (map == null) {
      return const BusinessDaySchedule(open: false);
    }
    final rawRanges = map['ranges'];
    final ranges = rawRanges is List
        ? rawRanges
            .whereType<Map>()
            .map(
              (row) => BusinessHoursRange.fromMap(
                Map<String, dynamic>.from(row),
              ),
            )
            .toList(growable: false)
        : const <BusinessHoursRange>[];
    final open = map['open'] == true && ranges.isNotEmpty;
    return BusinessDaySchedule(open: open, ranges: ranges);
  }
}

class BusinessScheduleStatus {
  const BusinessScheduleStatus({
    required this.configured,
    required this.isOpen,
    this.nextOpenLabel,
    this.closesAtLabel,
    this.caption,
  });

  final bool configured;
  final bool isOpen;
  final String? nextOpenLabel;
  final String? closesAtLabel;
  final String? caption;
}

class BusinessSchedule {
  const BusinessSchedule({
    this.timezone = 'America/Caracas',
    required this.days,
  });

  static const keys = <String>[
    'monday',
    'tuesday',
    'wednesday',
    'thursday',
    'friday',
    'saturday',
    'sunday',
  ];

  static const labels = <String, String>{
    'monday': 'Lunes',
    'tuesday': 'Martes',
    'wednesday': 'Miércoles',
    'thursday': 'Jueves',
    'friday': 'Viernes',
    'saturday': 'Sábado',
    'sunday': 'Domingo',
  };

  final String timezone;
  final Map<String, BusinessDaySchedule> days;

  bool get isConfigured =>
      days.values.any((day) => day.open && day.ranges.isNotEmpty);

  Map<String, dynamic> toMap() => {
        'timezone': timezone,
        'days': {
          for (final key in keys) key: (days[key] ?? const BusinessDaySchedule(open: false)).toMap(),
        },
      };

  factory BusinessSchedule.empty() {
    return BusinessSchedule(
      days: {
        for (final key in keys) key: const BusinessDaySchedule(open: false),
      },
    );
  }

  factory BusinessSchedule.fromJson(dynamic raw) {
    if (raw is! Map) return BusinessSchedule.empty();
    final map = Map<String, dynamic>.from(raw);
    final daysRaw = map['days'];
    final daysMap = daysRaw is Map ? Map<String, dynamic>.from(daysRaw) : <String, dynamic>{};
    return BusinessSchedule(
      timezone: (map['timezone']?.toString().trim().isNotEmpty ?? false)
          ? map['timezone'].toString().trim()
          : 'America/Caracas',
      days: {
        for (final key in keys)
          key: BusinessDaySchedule.fromMap(
            daysMap[key] is Map
                ? Map<String, dynamic>.from(daysMap[key] as Map)
                : null,
          ),
      },
    );
  }

  BusinessSchedule copyWithDay(String key, BusinessDaySchedule day) {
    return BusinessSchedule(
      timezone: timezone,
      days: {
        ...days,
        key: day,
      },
    );
  }

  static DateTime caracasNow([DateTime? now]) {
    final utc = (now ?? DateTime.now()).toUtc();
    return utc.subtract(const Duration(hours: 4));
  }

  static String weekdayKey(DateTime date) {
    return keys[(date.weekday - 1).clamp(0, 6)];
  }

  BusinessScheduleStatus statusAt([DateTime? now]) {
    if (!isConfigured) {
      return const BusinessScheduleStatus(
        configured: false,
        isOpen: false,
        caption: 'Aún no configuraste el horario de atención.',
      );
    }
    final local = caracasNow(now);
    final minutes = local.hour * 60 + local.minute;
    final todayKey = weekdayKey(local);
    final today = days[todayKey];
    if (today != null && today.open) {
      for (final range in today.ranges) {
        if (range.contains(minutes)) {
          return BusinessScheduleStatus(
            configured: true,
            isOpen: true,
            closesAtLabel: formatHour(range.end),
            caption:
                '🟢 Abierto ahora. Cierra a las ${formatHour(range.end)}',
          );
        }
      }
    }
    final next = _nextOpen(local);
    return BusinessScheduleStatus(
      configured: true,
      isOpen: false,
      nextOpenLabel: next,
      caption: next == null
          ? '🔴 Cerrado'
          : '🔴 Cerrado. Abrimos $next',
    );
  }

  String? _nextOpen(DateTime local) {
    final minutes = local.hour * 60 + local.minute;
    for (var offset = 0; offset < 7; offset++) {
      final day = local.add(Duration(days: offset));
      final key = weekdayKey(day);
      final schedule = days[key];
      if (schedule == null || !schedule.open || schedule.ranges.isEmpty) {
        continue;
      }
      final ranges = [...schedule.ranges]
        ..sort((a, b) => a.startMinutes.compareTo(b.startMinutes));
      for (final range in ranges) {
        if (offset == 0 && range.startMinutes <= minutes) {
          continue;
        }
        final when = formatHour(range.start);
        if (offset == 0) return 'hoy a las $when';
        if (offset == 1) return 'mañana a las $when';
        return '${labels[key]} a las $when';
      }
    }
    return null;
  }

  static String formatHour(String hm) {
    final parts = hm.split(':');
    final hour = int.tryParse(parts.isNotEmpty ? parts[0] : '') ?? 0;
    final minute = int.tryParse(parts.length > 1 ? parts[1] : '') ?? 0;
    final suffix = hour >= 12 ? 'PM' : 'AM';
    final hour12 = hour % 12 == 0 ? 12 : hour % 12;
    if (minute == 0) return '$hour12:00 $suffix';
    return '$hour12:${minute.toString().padLeft(2, '0')} $suffix';
  }
}
