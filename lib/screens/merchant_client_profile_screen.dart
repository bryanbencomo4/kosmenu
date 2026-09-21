import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:kosmenu_app/models/merchant_panel.dart';
import 'package:kosmenu_app/models/pedido.dart';
import 'package:kosmenu_app/services/order_manager_service.dart';

class MerchantClientProfileScreen extends StatelessWidget {
  const MerchantClientProfileScreen({
    super.key,
    required this.client,
    required this.onOpenOrder,
  });

  final MerchantClient client;
  final ValueChanged<PedidoModel> onOpenOrder;

  @override
  Widget build(BuildContext context) {
    final spent = client.totalSpent;
    final spentLabel = spent % 1 == 0 ? spent.toStringAsFixed(0) : spent.toStringAsFixed(2);
    return Scaffold(
      backgroundColor: const Color(0xFFF8F7FC),
      appBar: AppBar(
        title: Text(
          'Ficha de cliente',
          style: GoogleFonts.poppins(fontWeight: FontWeight.w700),
        ),
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
        children: [
          Container(
            padding: const EdgeInsets.all(18),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(20),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(client.name, style: GoogleFonts.poppins(fontSize: 22, fontWeight: FontWeight.w800)),
                const SizedBox(height: 4),
                Text(
                  client.phone.isEmpty ? 'Sin teléfono' : client.phone,
                  style: GoogleFonts.poppins(color: const Color(0xFF6B6F92)),
                ),
                const SizedBox(height: 16),
                Row(
                  children: [
                    Expanded(
                      child: _metric('${client.orderCount}', 'Pedidos realizados'),
                    ),
                    Expanded(
                      child: _metric('\$$spentLabel', 'Total gastado'),
                    ),
                  ],
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),
          Text(
            'Historial completo',
            style: GoogleFonts.poppins(fontWeight: FontWeight.w800, fontSize: 16),
          ),
          const SizedBox(height: 8),
          if (client.recentOrders.isEmpty)
            Text(
              'Este cliente aún no tiene pedidos registrados.',
              style: GoogleFonts.poppins(color: const Color(0xFF6B6F92)),
            )
          else
            for (final pedido in client.recentOrders)
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: Material(
                color: Colors.white,
                borderRadius: BorderRadius.circular(16),
                child: InkWell(
                  borderRadius: BorderRadius.circular(16),
                  onTap: () => onOpenOrder(pedido),
                  child: Padding(
                    padding: const EdgeInsets.all(14),
                    child: Row(
                      children: [
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                pedido.orderId ?? pedido.id,
                                style: GoogleFonts.poppins(fontWeight: FontWeight.w700),
                              ),
                              Text(
                                [
                                  if (pedido.createdAt != null)
                                    '${pedido.createdAt!.day.toString().padLeft(2, '0')}/${pedido.createdAt!.month.toString().padLeft(2, '0')}/${pedido.createdAt!.year}',
                                  if (pedido.total != null)
                                    '\$${(pedido.total!).toStringAsFixed(2)}',
                                ].join(' · '),
                                style: GoogleFonts.poppins(
                                  fontSize: 12,
                                  color: const Color(0xFF6B6F92),
                                ),
                              ),
                            ],
                          ),
                        ),
                        Text(
                          pedido.statusBucket.label,
                          style: GoogleFonts.poppins(fontSize: 12, color: const Color(0xFF6B6F92)),
                        ),
                        const Icon(Icons.chevron_right_rounded, color: Color(0xFF9CA3AF)),
                      ],
                    ),
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }

  Widget _metric(String value, String label) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(value, style: GoogleFonts.poppins(fontSize: 22, fontWeight: FontWeight.w800, color: const Color(0xFF6D28D9))),
        Text(label, style: GoogleFonts.poppins(fontSize: 12, color: const Color(0xFF6B6F92))),
      ],
    );
  }
}
