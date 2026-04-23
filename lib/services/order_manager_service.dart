import 'package:flutter/material.dart';
import 'package:kosmenu_app/models/pedido.dart';

enum OrderStatusBucket { pending, inProgress, completed, canceled }

class OrderManagerService {
  const OrderManagerService._();

  static OrderStatusBucket bucketFor(PedidoModel pedido) {
    return bucketForRawStatus(effectiveRawStatusForPedido(pedido));
  }

  static String normalizedRawStatus(String? estado) {
    final raw = (estado ?? '').trim().toLowerCase();
    if (raw.isEmpty) return 'pendiente';
    if (raw == 'confirmado' || raw == 'aceptado') return 'confirmado';
    if (raw == 'preparando' ||
        raw == 'preparacion' ||
        raw == 'preparación' ||
        raw == 'en_proceso' ||
        raw == 'en proceso' ||
        raw == 'listo') {
      return 'preparando';
    }
    if (raw == 'en_camino' || raw == 'en camino' || raw == 'despachado') {
      return 'en_camino';
    }
    if (raw == 'entregado' || raw == 'completado' || raw == 'finalizado') {
      return 'entregado';
    }
    if (raw == 'cancelado' || raw == 'anulado' || raw == 'rechazado') {
      return 'cancelado';
    }
    return 'pendiente';
  }

  static String delegateStatusForPedido(PedidoModel pedido) {
    final rawDelegate = pedido.detalles['delivery_delegate'];
    if (rawDelegate is! Map) return '';
    final delegate = Map<String, dynamic>.from(rawDelegate);
    return (delegate['status'] ?? '').toString().trim().toLowerCase();
  }

  static bool isDelegationActiveStatus(String status) {
    return status == 'pending' || status == 'accepted' || status == 'arrived';
  }

  static bool hasActiveDelegationForPedido(PedidoModel pedido) {
    final status = delegateStatusForPedido(pedido);
    return isDelegationActiveStatus(status);
  }

  static bool isDelegationControlTransferredForPedido(PedidoModel pedido) {
    final status = delegateStatusForPedido(pedido);
    return status == 'accepted' || status == 'arrived';
  }

  static String effectiveRawStatusForPedido(PedidoModel pedido) {
    final rawStatus = normalizedRawStatus(pedido.estado);
    final delegateStatus = delegateStatusForPedido(pedido);

    if (delegateStatus == 'completed') {
      return 'entregado';
    }

    if ((delegateStatus == 'accepted' || delegateStatus == 'arrived') &&
        rawStatus != 'cancelado' &&
        rawStatus != 'entregado') {
      return 'en_camino';
    }

    return rawStatus;
  }

  static String visualStatusCodeForPedido(PedidoModel pedido) {
    final rawStatus = normalizedRawStatus(pedido.estado);
    final delegateStatus = delegateStatusForPedido(pedido);

    if (delegateStatus == 'completed') {
      return 'entregado';
    }

    if (delegateStatus == 'arrived' &&
        rawStatus != 'cancelado' &&
        rawStatus != 'entregado') {
      return 'espera_cliente';
    }

    if (delegateStatus == 'accepted' &&
        rawStatus != 'cancelado' &&
        rawStatus != 'entregado') {
      return 'en_camino';
    }

    return rawStatus;
  }

  static String visualStatusLabelForPedido(PedidoModel pedido) {
    switch (visualStatusCodeForPedido(pedido)) {
      case 'confirmado':
        return 'Confirmado';
      case 'preparando':
        return 'Preparando';
      case 'en_camino':
        return 'En camino';
      case 'espera_cliente':
        return 'Espera cliente';
      case 'entregado':
        return 'Entregado';
      case 'cancelado':
        return 'Cancelado';
      default:
        return 'Pendiente';
    }
  }

  static Color visualStatusColorForPedido(PedidoModel pedido) {
    switch (visualStatusCodeForPedido(pedido)) {
      case 'confirmado':
        return const Color(0xFF2563EB);
      case 'preparando':
        return const Color(0xFFF59E0B);
      case 'en_camino':
        return const Color(0xFF0EA5E9);
      case 'espera_cliente':
        return const Color(0xFFD97706);
      case 'entregado':
        return const Color(0xFF16A34A);
      case 'cancelado':
        return const Color(0xFFE11D48);
      default:
        return const Color(0xFFF59E0B);
    }
  }

  static IconData visualStatusIconForPedido(PedidoModel pedido) {
    switch (visualStatusCodeForPedido(pedido)) {
      case 'confirmado':
        return Icons.thumb_up_alt_outlined;
      case 'preparando':
        return Icons.restaurant_rounded;
      case 'en_camino':
        return Icons.delivery_dining_rounded;
      case 'espera_cliente':
        return Icons.hourglass_top_rounded;
      case 'entregado':
        return Icons.check_circle_rounded;
      case 'cancelado':
        return Icons.cancel_rounded;
      default:
        return Icons.timelapse_rounded;
    }
  }

  static String deliveryDelegateLabelForPedido(PedidoModel pedido) {
    final status = delegateStatusForPedido(pedido);
    if (status == 'pending') return 'Pedido delegado: esperando aceptacion';
    if (status == 'accepted') return 'Repartidor acepto delivery';
    if (status == 'arrived') {
      return 'Repartidor reporto llegada. En espera de confirmacion del cliente';
    }
    if (status == 'completed') return 'Entrega confirmada por cliente';
    if (status == 'expired') return 'Delegacion expirada';
    if (status == 'revoked') return 'Delegacion revocada';
    return '';
  }

  static OrderStatusBucket bucketForRawStatus(String? rawStatus) {
    final raw = normalizedRawStatus(rawStatus);

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
        raw == 'espera_cliente' ||
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
