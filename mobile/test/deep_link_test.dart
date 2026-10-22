import 'package:flutter_test/flutter_test.dart';
import 'package:negev_events/state/deep_link_handler.dart';

/// المسارات التي يعرفها التطبيق (تذكرة #104): `/e/<id>` و`/a/<id>` و`/p/<id>`.
/// والاستخراج دالّة نقيّة، فتُختبر بلا جهاز ولا ملاحة.
void main() {
  group('روابط التطبيق العميقة', () {
    DeepLinkTarget? target(String url) =>
        DeepLinkHandler.extractTarget(Uri.parse(url));

    test('المناسبة والألبوم والصورة والشخص تُستخرج بأنواعها', () {
      expect(target('https://munasbat.test/e/1'), (kind: 'event', id: 1));
      expect(target('https://munasbat.test/a/2'), (kind: 'album', id: 2));
      expect(target('https://munasbat.test/p/3'), (kind: 'photo', id: 3));
      expect(target('https://munasbat.test/person/4'), (kind: 'person', id: 4));
    });

    test('مسارٌ لا نعرفه أو رقمٌ خاطئ يُتجاهل بصمت', () {
      expect(target('https://munasbat.test/x/1'), isNull);
      expect(target('https://munasbat.test/'), isNull);
      expect(target('https://munasbat.test/a/'), isNull);
      expect(target('https://munasbat.test/a/abc'), isNull);
      expect(target('https://munasbat.test/a/0'), isNull);
      expect(target('https://munasbat.test/a/-4'), isNull);
    });

    test('مسارات أخرى تُركت كما كانت', () {
      expect(target('https://munasbat.test/live/e/9'), isNull,
          reason: 'الحلقة صفحة ويب لا شاشة تطبيق');
      expect(target('https://munasbat.test/e/12/extra'), (kind: 'event', id: 12),
          reason: 'المقطع الثاني هو المعرّف، وما بعده لا يغيّر الوجهة');
    });
  });
}
