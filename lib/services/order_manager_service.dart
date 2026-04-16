import 'package:flutter/material.dart';
import 'package:kosmenu_app/models/pedido.dart';

enum OrderStatusBucket { pending, inProgress, completed, canceled }

class OrderManagerService {
  const OrderManagerService._();

  static OrderStatusBucket bucketFor(PedidoModel pedido) {
    return bucketForRawStatus(pedido.estado);
  }

  static OrderStatusBucket bucketForRawStatus(String? rawStatus) {
    final raw = (rawStatus ?? '').trim().toLowerCase();

    if (raw.isEmpty ||
        raw == 'pendiente' ||
        raw == 'nuevo' ||
        raw == 'recibido' ||
        raw == 'por_confirmar' ||
        raw == 'por confirmar') {
      return OrderStatusBucket.pending;
    }

    if (raw == 'en_proceso' ||
        raw == 'en proceso' ||
        raw == 'preparando' ||
        raw == 'preparacion' ||
        raw == 'preparación' ||
        raw == 'listo' ||
        raw == 'en_camino' ||
        raw == 'en camino' ||
        raw == 'despachado' ||
        raw == 'aceptado' ||
        raw == 'confirmado') {
      return OrderStatusBucket.inProgress;
    }

    if (raw.contains('complet') || raw == 'entregado' || raw == 'finalizado') {
      return OrderStatusBucket.completed;
    }

    if (raw.contains('cancel') || raw == 'rechazado' || raw == 'anulado') {
      return OrderStatusBucket.canceled;
    }

    return OrderStatusBucket.pending;
  }
}

extension PedidoOrderManagerX on PedidoModel {
  OrderStatusBucket get statusBucket => OrderManagerService.bucketFor(this);

  bool get isFinalizedStatus {
    return statusBucket == OrderStatusBucket.completed ||
        statusBucket == OrderStatusBucket.canceled;
  }
}

extension OrderStatusBucketPresentationX on OrderStatusBucket {
  String get label {
    switch (this) {
      case OrderStatusBucket.pending:
        return 'Pendiente';
      case OrderStatusBucket.inProgress:
        return 'En proceso';
      case OrderStatusBucket.completed:
        return 'Completado';
      case OrderStatusBucket.canceled:
        return 'Cancelado';
    }
  }

  IconData get icon {
    switch (this) {
      case OrderStatusBucket.pending:
        return Icons.timelapse_rounded;
      case OrderStatusBucket.inProgress:
        return Icons.local_shipping_rounded;
      case OrderStatusBucket.completed:
        return Icons.check_circle_rounded;
      case OrderStatusBucket.canceled:
        return Icons.cancel_rounded;
    }
  }

  Color get color {
    switch (this) {
      case OrderStatusBucket.pending:
        return const Color(0xFFF59E0B);
      case OrderStatusBucket.inProgress:
        return const Color(0xFF2563EB);
      case OrderStatusBucket.completed:
        return const Color(0xFF16A34A);
      case OrderStatusBucket.canceled:
        return const Color(0xFFE11D48);
    }
  }
}
