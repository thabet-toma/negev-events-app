import 'dart:math';

import 'package:shared_preferences/shared_preferences.dart';

/// معرّف عشوائي بحت لتمييز جهاز غير مسجَّل بين مشاهدتين — لا يُشتقّ من أي
/// معرّف عتاد (لا androidId ولا IMEI ولا أي شيء يعرّف الجهاز خارج هذا
/// التطبيق)، بنفس سبب رفض إرسال موقع الجهاز للخادم في خطوة ١٤: المطلوب
/// تمييز مشاهدَين لا معرفة من هو. يُولَّد مرّة واحدة عبر [Random.secure] ثم
/// يُحفظ في shared_preferences.
class DeviceIdStore {
  DeviceIdStore._();

  static const _key = 'negev_device_id';
  static String? _cached;

  static Future<String> get() async {
    final cached = _cached;
    if (cached != null) return cached;

    final prefs = await SharedPreferences.getInstance();
    final existing = prefs.getString(_key);
    if (existing != null && existing.isNotEmpty) {
      _cached = existing;
      return existing;
    }

    final generated = _generate();
    await prefs.setString(_key, generated);
    _cached = generated;
    return generated;
  }

  static String _generate() {
    final random = Random.secure();
    final bytes = List<int>.generate(16, (_) => random.nextInt(256));
    return bytes.map((b) => b.toRadixString(16).padLeft(2, '0')).join();
  }
}
