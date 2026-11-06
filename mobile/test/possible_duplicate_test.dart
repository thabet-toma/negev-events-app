import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:negev_events/api/api_client.dart';
import 'package:negev_events/api/negev_api.dart';
import 'package:negev_events/widgets/possible_duplicate_dialog.dart';

const _json = {'content-type': 'application/json; charset=utf-8'};

const _duplicateBody = {
  'success': false,
  'message': 'توجد مناسبة مشابهة لهذه المناسبة',
  'details': {
    'code': 'POSSIBLE_DUPLICATE',
    'duplicates': [
      {
        'id': 41,
        'title': '',
        'honorees': ['أحمد', 'سالم'],
        'town': 'رهط',
        'event_date': '2026-11-05',
        'event_end_date': null,
        'status': 'approved',
        'occasion_type_name': 'عرس',
        'poster_url': null,
        'confidence': 'certain',
        'reasons': ['نفس الاسم', 'نفس التاريخ'],
      },
      {
        'id': 42,
        'title': 'حفل',
        'honorees': <String>[],
        'town': 'رهط',
        'event_date': '2026-11-05T00:00:00.000Z',
        'event_end_date': '2026-11-06',
        'status': 'pending',
        'occasion_type_name': null,
        'poster_url': 'https://example.com/p.jpg',
        'confidence': 'likely',
        'reasons': <String>[],
      },
    ],
  },
};

/// يلتقط جسم الطلب كنص ويردّ بـ[status]/[body].
NegevApi _api(int status, Object body, {List<String>? sentBodies}) {
  final client = MockClient((request) async {
    sentBodies?.add(utf8.decode(request.bodyBytes));
    return http.Response(jsonEncode(body), status, headers: _json);
  });
  return NegevApi(ApiClient(client: client));
}

Future<EventSubmissionResult> _submit(NegevApi api, {bool confirm = false}) =>
    api.submitEvent(
      occasionTypeId: 1,
      honorees: const [
        {'name': 'أحمد'}
      ],
      fields: const {'town': 'رهط', 'event_date': '2026-11-05'},
      confirmDuplicate: confirm,
    );

void main() {
  test('409 POSSIBLE_DUPLICATE throws PossibleDuplicateException with parsed duplicates', () async {
    final api = _api(409, _duplicateBody);

    await expectLater(
      _submit(api),
      throwsA(
        isA<PossibleDuplicateException>()
            .having((e) => e.message, 'message', 'توجد مناسبة مشابهة لهذه المناسبة')
            .having((e) => e.statusCode, 'statusCode', 409)
            .having((e) => e.duplicates.length, 'count', 2)
            .having((e) => e.duplicates[0].honorees, 'honorees', ['أحمد', 'سالم'])
            .having((e) => e.duplicates[0].occasionTypeName, 'type', 'عرس')
            .having((e) => e.duplicates[0].isCertain, 'certain', true)
            .having((e) => e.duplicates[0].reasons, 'reasons', ['نفس الاسم', 'نفس التاريخ'])
            .having((e) => e.duplicates[1].status, 'status', 'pending')
            .having((e) => e.duplicates[1].eventDate, 'date normalized', '2026-11-05')
            .having((e) => e.duplicates[1].eventEndDate, 'end date', '2026-11-06')
            .having((e) => e.duplicates[1].isCertain, 'likely', false),
      ),
    );
  });

  test('a 409 without the POSSIBLE_DUPLICATE code stays a plain ApiException', () async {
    final api = _api(409, {
      'success': false,
      'message': 'تعارض آخر',
      'details': {'code': 'SOMETHING_ELSE'},
    });

    await expectLater(
      _submit(api),
      throwsA(
        isA<ApiException>()
            .having((e) => e is PossibleDuplicateException, 'is duplicate', false)
            .having((e) => e.message, 'message', 'تعارض آخر')
            .having((e) => e.statusCode, 'statusCode', 409),
      ),
    );
  });

  test('POSSIBLE_DUPLICATE code on a non-409 status stays a plain ApiException', () async {
    final api = _api(400, _duplicateBody);

    await expectLater(
      _submit(api),
      throwsA(
        isA<ApiException>().having(
          (e) => e is PossibleDuplicateException,
          'is duplicate',
          false,
        ),
      ),
    );
  });

  test('submitEvent sends confirm_duplicate=1 only when confirmDuplicate is true', () async {
    final plain = <String>[];
    final confirmed = <String>[];
    final ok = {'success': true, 'message': 'تم'};

    await _submit(_api(201, ok, sentBodies: plain));
    await _submit(_api(201, ok, sentBodies: confirmed), confirm: true);

    expect(plain.single.contains('confirm_duplicate'), isFalse);
    final body = confirmed.single;
    expect(body.contains('name="confirm_duplicate"'), isTrue);
    expect(RegExp(r'name="confirm_duplicate"\r?\n\r?\n1\r?\n').hasMatch(body), isTrue);
  });

  // --- التعديل (تذكرة #159) ------------------------------------------
  //
  // تعديل مناسبة معتمدة قد يخرج للعلن أيضاً، فحارس التكرار يقف على
  // PATCH /api/events/:id بنفس الـ409. الأدمن وحده يُوقَف؛ والمستخدم العادي
  // لا يرى الحارس (يعود تعديله للمراجعة، وهذا شأن الخادم).

  const updateOk = {
    'success': true,
    'message': 'تم حفظ التعديل، والمناسبة تبقى منشورة كما هي',
    'amendment': 'cosmetic',
    'status': 'approved',
  };

  Future<EventUpdateResult> updateVia(NegevApi api, {bool confirm = false}) =>
      api.updateEvent(
        7,
        fields: const {
          'honorees': [
            {'name': 'أحمد'}
          ]
        },
        confirmDuplicate: confirm,
      );

  test('updateEvent on a 409 POSSIBLE_DUPLICATE throws the same exception publishing throws', () async {
    await expectLater(
      updateVia(_api(409, _duplicateBody)),
      throwsA(
        isA<PossibleDuplicateException>()
            .having((e) => e.statusCode, 'statusCode', 409)
            .having((e) => e.duplicates.length, 'count', 2)
            .having((e) => e.duplicates[0].id, 'first id', 41)
            .having((e) => e.duplicates[0].isCertain, 'certain', true)
            .having((e) => e.duplicates[1].isCertain, 'likely', false),
      ),
    );
  });

  test('updateEvent sends confirm_duplicate only on the retry, and reads the outcome from the server', () async {
    final plain = <String>[];
    final confirmed = <String>[];

    final result = await updateVia(_api(200, updateOk, sentBodies: plain));
    expect(result.status, 'approved');
    expect(result.amendment, 'cosmetic');
    await updateVia(_api(200, updateOk, sentBodies: confirmed), confirm: true);

    expect(plain.single.contains('confirm_duplicate'), isFalse);
    expect(confirmed.single.contains('"confirm_duplicate":true'), isTrue,
        reason: 'the retry must carry the confirmation the server records as an override');
  });

  testWidgets('the one shared confirm window shows the matches and confirms from the edit label', (tester) async {
    final exception = PossibleDuplicateException.tryParse(
      409,
      jsonDecode(jsonEncode(_duplicateBody)) as Map<String, dynamic>,
    )!;

    bool? answer;
    await tester.pumpWidget(
      MaterialApp(
        home: Builder(
          builder: (context) => ElevatedButton(
            onPressed: () async {
              answer = await confirmPossibleDuplicateAction(
                context,
                exception,
                confirmLabel: 'حفظ رغم ذلك',
              );
            },
            child: const Text('افتح النافذة'),
          ),
        ),
      ),
    );

    await tester.tap(find.text('افتح النافذة'));
    await tester.pumpAndSettle();

    expect(find.text('تنبيه: مناسبة مشابهة موجودة'), findsOneWidget);
    expect(find.text('عرس — أحمد و سالم'), findsOneWidget, reason: 'the first match names its type and owners');
    expect(find.textContaining('• نفس الاسم'), findsOneWidget);
    expect(find.text('حفظ رغم ذلك'), findsOneWidget, reason: 'the edit flow reuses the window with its own verb');
    expect(find.text('نشر رغم ذلك'), findsNothing);

    await tester.tap(find.text('حفظ رغم ذلك'));
    await tester.pumpAndSettle();
    expect(answer, isTrue);
  });
}
