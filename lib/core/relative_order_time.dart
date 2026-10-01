String formatRelativeOrderTime(DateTime? createdAt, {DateTime? now}) {
  if (createdAt == null) return 'hora no disponible';

  final localCreatedAt = createdAt.toLocal();
  final elapsed = (now ?? DateTime.now()).difference(localCreatedAt);
  if (elapsed < const Duration(minutes: 1)) return 'ahora';
  if (elapsed < const Duration(hours: 1)) {
    return 'hace ${elapsed.inMinutes} min';
  }
  if (elapsed < const Duration(days: 1)) {
    return 'hace ${elapsed.inHours}h';
  }
  if (elapsed < const Duration(days: 7)) {
    final days = elapsed.inDays;
    return 'hace $days día${days == 1 ? '' : 's'}';
  }

  const weekdays = <String>[
    'lunes',
    'martes',
    'miércoles',
    'jueves',
    'viernes',
    'sábado',
    'domingo',
  ];
  return 'desde el ${weekdays[localCreatedAt.weekday - 1]}';
}
