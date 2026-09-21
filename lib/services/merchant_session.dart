import 'package:kosmenu_app/models/merchant_panel.dart';
import 'package:kosmenu_app/widgets/merchant_dashboard_home.dart';

class MerchantSession {
  MerchantSession._();

  static MerchantStaffRole role = MerchantStaffRole.administrador;
  static bool isOwner = true;

  static void set({
    required MerchantStaffRole role,
    required bool isOwner,
  }) {
    MerchantSession.role = role;
    MerchantSession.isOwner = isOwner;
  }

  static void clear() {
    role = MerchantStaffRole.administrador;
    isOwner = true;
  }

  static bool get isAdmin =>
      isOwner || role == MerchantStaffRole.administrador;

  static bool get canManageCatalog => isAdmin;
  static bool get canManageStaff => isAdmin;
  static bool get canManageBilling => isAdmin;
  static bool get canManageHours => isAdmin;
  static bool get canManageSettings => isAdmin;
  static bool get canSeeClients =>
      isAdmin || role == MerchantStaffRole.caja;
  static bool get canSeeStats =>
      isAdmin || role == MerchantStaffRole.marketing;
  static bool get canSeeMarketing =>
      isAdmin || role == MerchantStaffRole.marketing;
  static bool get canSeeSalesKpis =>
      isAdmin ||
      role == MerchantStaffRole.caja ||
      role == MerchantStaffRole.marketing;

  static bool canOpen(MerchantNavDestination destination) {
    if (isAdmin) return true;
    switch (role) {
      case MerchantStaffRole.caja:
        return destination == MerchantNavDestination.home ||
            destination == MerchantNavDestination.orders ||
            destination == MerchantNavDestination.clients;
      case MerchantStaffRole.cocina:
        return destination == MerchantNavDestination.home ||
            destination == MerchantNavDestination.orders;
      case MerchantStaffRole.marketing:
        return destination == MerchantNavDestination.home ||
            destination == MerchantNavDestination.digitalMenu ||
            destination == MerchantNavDestination.stats ||
            destination == MerchantNavDestination.marketing;
      case MerchantStaffRole.administrador:
        return true;
    }
  }

  static String deniedMessage(String action) {
    return 'Tu rol (${role.label}) no puede $action.';
  }
}
