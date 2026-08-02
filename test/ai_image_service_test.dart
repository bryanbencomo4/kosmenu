import 'package:flutter_test/flutter_test.dart';
import 'package:kosmenu_app/services/ai_image_service.dart';

void main() {
  group('formatAiImageUserMessage', () {
    test('maps onboarding once-limit FunctionException text', () {
      const raw =
          'FunctionException(status: 429, details: {error: AI image limit reached, message: AI image generation is only available once during onboarding}, reasonPhrase: )';
      final message = formatAiImageUserMessage(raw);
      expect(message, contains('una vez durante el onboarding'));
      expect(message, contains('menú sí se importó'));
      expect(isAiImageOnboardingLimitMessage(message), isTrue);
    });

    test('keeps spanish soft-skip message readable', () {
      const raw =
          'La generacion de imagenes IA ya se uso una vez en onboarding. El menu se importo bien; no se vuelven a encolar imagenes.';
      expect(isAiImageOnboardingLimitMessage(raw), isTrue);
      final message = formatAiImageUserMessage(raw);
      expect(message, contains('una vez durante el onboarding'));
    });
  });
}
