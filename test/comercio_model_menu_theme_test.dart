import 'package:flutter_test/flutter_test.dart';
import 'package:kosmenu_app/models/comercio.dart';

void main() {
  group('ComercioModel.menuThemeMode', () {
    test('defaults to light when missing', () {
      final model = ComercioModel.fromMap(<String, dynamic>{
        'id': 'c1',
        'nombre': 'Demo',
      });
      expect(model.menuThemeMode, 'light');
      expect(model.toMap()['menu_theme_mode'], 'light');
    });

    test('loads and persists dark', () {
      final model = ComercioModel.fromMap(<String, dynamic>{
        'id': 'c1',
        'nombre': 'Demo',
        'menu_theme_mode': 'dark',
        'menu_palette_primary': 0xFFAA0000,
      });
      expect(model.menuThemeMode, 'dark');
      expect(model.menuPalettePrimaryArgb, 0xFFAA0000);
      expect(model.toMap()['menu_theme_mode'], 'dark');
    });

    test('rejects arbitrary theme values', () {
      final model = ComercioModel.fromMap(<String, dynamic>{
        'id': 'c1',
        'nombre': 'Demo',
        'menu_theme_mode': 'neon',
      });
      expect(model.menuThemeMode, 'light');
    });
  });
}
