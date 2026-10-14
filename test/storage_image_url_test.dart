import 'package:flutter_test/flutter_test.dart';
import 'package:kosmenu_app/services/storage_image_url.dart';

void main() {
  test('rewrites Supabase public object URLs to WebP render thumbs', () {
    final optimized = StorageImageUrl.optimize(
      'https://project.supabase.co/storage/v1/object/public/product-images/shop/pizza.png?download=0',
      width: 200,
      quality: 70,
    );
    final uri = Uri.parse(optimized!);
    expect(
      uri.path,
      '/storage/v1/render/image/public/product-images/shop/pizza.png',
    );
    expect(uri.queryParameters['width'], '200');
    expect(uri.queryParameters['quality'], '70');
    expect(uri.queryParameters['format'], 'webp');
    expect(uri.queryParameters['download'], '0');
  });

  test('leaves external URLs unchanged', () {
    const external = 'https://cdn.example.com/menu/pizza.jpg';
    expect(StorageImageUrl.optimize(external, width: 200), external);
    expect(StorageImageUrl.optimize(null), isNull);
    expect(StorageImageUrl.optimize(''), isNull);
  });
}
