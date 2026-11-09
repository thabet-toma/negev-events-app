import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;

import '../api/api_client.dart';
import '../api/negev_api.dart';
import '../main.dart';
import '../models/event.dart';
import '../state/auth_store.dart';
import '../state/places_store.dart';
import '../theme.dart';
import '../widgets/async_view.dart';
import '../widgets/auth_action_button.dart';
import '../widgets/location_picker_map.dart';
import '../widgets/possible_duplicate_dialog.dart';
import 'account_screen.dart';
import 'add_event_screen.dart'
    show
        HonoreeRow,
        EventDayRow,
        EventDaysEditor,
        EventVisibilityField,
        DateField,
        collectEventDays,
        eventProgramLabel,
        kEventTextFieldKeys,
        kEventFieldHints,
        formatEventDate,
        formatPublishAt,
        pickPublishAt,
        PublishAtField,
        kVillagesTown,
        kVillageNotListedOption,
        kRequestedVillageNameMaxLength,
        pickPosterImage;
import 'card_studio_screen.dart';
import 'my_events_screen.dart' show eventStatusLabel, eventStatusColor;

/// الحقول التي يصنّفها الخادم دائماً حرِجة (events.service.js
/// CRITICAL_AMENDMENT_FIELDS) — تُستعمل هنا فقط لقرار عرض تحذير **قبل**
/// الحفظ. التصنيف الفعلي في الردّ (`amendment`) يبقى مصدر الحقيقة الوحيد؛
/// هذه القائمة لا تُعرض للمستخدم كحقيقة، هي فقط سبب لسؤاله قبل الإرسال.
///
/// `extra_days` ليست فيها: الخادم يصنّفها على محتواها لا على اسم العمود —
/// حرِجة حين يتحرّك جدول الأيام وحدها، تجميلية حين يتغيّر اسمٌ أو وقت. قرارها
/// يُبنى بـ`eventDaysPlacementChanged` بجانب هذه القائمة.
///
/// و`region_id` ليست فيها: محافظة القرية مشتقّة على الخادم ولا تدخل
/// `changedColumns` أصلاً (وسيط مستقلّ في `updateEvent`)، فتغييرها وحده لا
/// يعيد المناسبة إلى المراجعة — وتحذيرها كان كذباً على المستخدم.
///
/// و`visibility` ليست فيها (تذكرة #166): تُصنَّف تجميلية على الخادم — إخفاء
/// مناسبة معتمدة أو إعادتها عامةً لا يمسّ تاريخها ولا مكانها، ولا يُخرجها من
/// الاعتماد (وإلا صار رابطها `/e/:id` 404). فتحذيرها هنا كذبٌ أيضاً.
const _fieldsThatMayTriggerReview = {
  'event_date',
  'event_end_date',
  'town',
  'village_id',
  'requested_village_name',
  'location_name',
  'latitude',
  'longitude',
};

/// هل يغيّر تعديل الأيام الإضافية جدولها (فتعود المناسبة للمراجعة) أم يكتفي
/// بوصفه؟ حرِج إذا اختلفت مجموعة أزواج (التاريخ، المكان) — يوم أُضيف أو حُذف
/// أو أُعيد تأريخه أو نُقل — أو إذا بقيت الأسماء نفسها واختلفت ثلاثيات
/// (الاسم، التاريخ، المكان): يومان مسمّيان تبادلا تاريخَيهما أو مكانَيهما.
/// تعديل الاسم و/أو الوقت وحده ليس حرِجاً. دالة صِرفة عامة لتبقى قابلة
/// للاختبار دون تركيب الشاشة كاملة.
bool eventDaysPlacementChanged(
  List<Map<String, String>> before,
  List<Map<String, String>> after,
) {
  List<String> pairs(List<Map<String, String>> days) =>
      days.map((day) => '${day['date'] ?? ''}\u0000${day['place'] ?? ''}').toList()
        ..sort();
  List<String> names(List<Map<String, String>> days) =>
      days.map((day) => day['name'] ?? '').toList()..sort();
  List<String> triples(List<Map<String, String>> days) => days
      .map((day) =>
          '${day['name'] ?? ''}\u0000${day['date'] ?? ''}\u0000${day['place'] ?? ''}')
      .toList()
    ..sort();

  if (!listEquals(pairs(before), pairs(after))) return true;
  return listEquals(names(before), names(after)) &&
      !listEquals(triples(before), triples(after));
}

/// تسميات احتياطية لحقول ليست جزءاً من إعداد نوع المناسبة (`latitude`/
/// `longitude` بنائيان دائماً، لا حقل قابل للإخفاء) — تُستعمل فقط في عرض
/// سجلّ التعديلات حين يغيب `type.labelFor`.
const _amendmentFieldFallbackLabels = {
  'latitude': 'خط العرض',
  'longitude': 'خط الطول',
};

/// رسالة التعديل النهائية — التحذير (إن وُجد) يُلحَق كما وصل من الخادم، بلا
/// إعادة صياغة. نفس نمط composeEventSubmitMessage في شاشة النشر.
String composeEventUpdateMessage(EventUpdateResult result) {
  return result.locationWarning == null
      ? result.message
      : '${result.message}\n${result.locationWarning}';
}

/// تعديل مناسبة يملكها المستخدم (أو أي مناسبة للإدارة).
///
/// نفس الحقول الديناميكية من إعداد نوع المناسبة التي يستعملها النشر — لا فرع
/// واحد على اسم النوع هنا. حفظ الحقول `JSON` كما كان؛ و**رفع ملصق البطاقة
/// الجاهزة وحده** يمرّ بـ`PATCH /api/events/:id` متعدد الأجزاء (حقل `poster`)
/// من بابها المستقلّ، فلا يتغيّر سلوك التعديل العادي. الصوت يبقى للقراءة فقط.
class EditEventScreen extends StatefulWidget {
  const EditEventScreen({super.key, required this.event});

  final Event event;

  @override
  State<EditEventScreen> createState() => _EditEventScreenState();
}

class _EditEventScreenState extends State<EditEventScreen> {
  late OccasionType? _type;
  Future<Map<String, TownCoordinate>>? _townCoordsFuture;
  Future<List<Amendment>>? _amendmentsFuture;
  Future<List<Village>>? _villagesFuture;
  bool _placesRequested = false;

  final Map<String, TextEditingController> _controllers = {};
  late List<HonoreeRow> _honorees;
  late List<EventDayRow> _days;

  late String _town;
  // القرية تحت البند الجامع فقط: معرّف من القائمة، أو «قريتي غير موجودة»
  // باسم مكتوب — لا الاثنان معاً (قاعدة خادمية).
  int? _villageId;
  bool _villageNotListed = false;
  final _requestedVillageController = TextEditingController();
  // محافظة القرية (تذكرة #125) — تُعرض بمحافظة المناسبة نفسها، وتُرسَل عند
  // تغييرها وحدها (مفتاح غائب = «بلا تعديل» عند الخادم).
  int? _regionId;
  // ظهور المناسبة (تذكرة #166) — من الصفّ نفسه، ويُرسَل عند تغييره وحده.
  late EventVisibility _visibility;
  late EventVisibility _originalVisibility;
  // موعد النشر المجدول (تذكرة #167) — من الصفّ نفسه، ويُرسَل عند تغييره وحده.
  // القيمة المخزَّنة بصيغة `YYYY-MM-DDTHH:mm` في [_originalPublishAt]، فإعادة
  // إرسالها كما هي «بلا تعديل» عند الخادم ولو حلّ موعدها.
  DateTime? _publishAt;
  String? _originalPublishAt;
  DateTime? _eventDate;
  DateTime? _eventEndDate;
  DateTime? _youthDate;
  double? _latitude;
  double? _longitude;

  bool _saving = false;
  String? _status;

  /// الملصق المعروض — يبدأ من الصفّ ويتغيّر بعد رفع البطاقة الجاهزة، بدل
  /// قراءة `widget.event.posterUrl` الثابتة.
  late String? _posterUrl;
  bool _posterUploaded = false;
  bool _uploadingReadyCard = false;

  late Map<String, String> _originalText;
  late String _originalTown;
  int? _originalVillageId;
  String _originalRequestedVillageName = '';
  int? _originalRegionId;
  String? _originalEventDate;
  String? _originalEventEndDate;
  String? _originalYouthDate;
  double? _originalLatitude;
  double? _originalLongitude;
  late List<Map<String, String>> _originalHonorees;
  late List<Map<String, String>> _originalDays;

  @override
  void initState() {
    super.initState();
    _type = widget.event.occasionType;
    _status = widget.event.status;
    _posterUrl = widget.event.posterUrl;
    _loadFromEvent(widget.event);
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _townCoordsFuture ??=
        AppServices.of(context).places.load().then((c) => c.townCoordinates);
    _amendmentsFuture ??= AppServices.of(context).api.eventAmendments(widget.event.id);
    if (!_placesRequested) {
      _placesRequested = true;
      // بلدات الخادم ومحافظاته تصل بعد أول بناء — إعادة بناء واحدة تكفي.
      AppServices.of(context).places.load().then((_) {
        if (mounted) setState(() {});
      });
    }
  }

  @override
  void dispose() {
    for (final controller in _controllers.values) {
      controller.dispose();
    }
    for (final row in _honorees) {
      row.dispose();
    }
    for (final row in _days) {
      row.dispose();
    }
    _requestedVillageController.dispose();
    super.dispose();
  }

  String _textValueOf(Event event, String key) {
    switch (key) {
      case 'title':
        return event.title;
      case 'family_clan':
        return event.familyClan;
      case 'location_name':
        return event.locationName;
      case 'secondary_location_name':
        return event.secondaryLocationName ?? '';
      case 'dinner_time':
        return event.dinnerTime;
      case 'audio_title':
        return event.audioTitle ?? '';
      case 'host_phone':
        return event.hostPhone ?? '';
      default:
        return '';
    }
  }

  void _loadFromEvent(Event event) {
    _originalText = {
      for (final key in kEventTextFieldKeys) key: _textValueOf(event, key),
    };
    for (final entry in _originalText.entries) {
      _controllerFor(entry.key).text = entry.value;
    }

    _town = event.town;
    _originalTown = event.town;

    _villageId = event.villageId;
    _originalVillageId = event.villageId;
    _originalRequestedVillageName =
        event.villageId == null ? (event.requestedVillageName ?? '') : '';
    _villageNotListed = _originalRequestedVillageName.isNotEmpty;
    _requestedVillageController.text = _originalRequestedVillageName;

    _regionId = event.regionId;
    _originalRegionId = event.regionId;

    _visibility = event.visibility;
    _originalVisibility = event.visibility;

    // موعد النشر (تذكرة #167): `publishAt` ساعة حائط بتوقيت UTC (انظر
    // `_toPublishWallClock` في النموذج)، فحقولها هي ما يُعرض ويُرسَل.
    _publishAt = event.publishAt;
    _originalPublishAt = event.publishAt == null ? null : formatPublishAt(event.publishAt!);

    _eventDate = event.eventDate.isEmpty ? null : DateTime.tryParse(event.eventDate);
    _originalEventDate = event.eventDate.isEmpty ? null : event.eventDate;

    _eventEndDate = event.eventEndDate == null ? null : DateTime.tryParse(event.eventEndDate!);
    _originalEventEndDate = event.eventEndDate;

    _youthDate = event.youthPartyDate == null ? null : DateTime.tryParse(event.youthPartyDate!);
    _originalYouthDate = event.youthPartyDate;

    _latitude = event.latitude;
    _longitude = event.longitude;
    _originalLatitude = event.latitude;
    _originalLongitude = event.longitude;

    _honorees = event.honorees.isEmpty
        ? [HonoreeRow()]
        : event.honorees.map((honoree) {
            final row = HonoreeRow();
            row.nameController.text = honoree.name;
            row.roleController.text = honoree.role ?? '';
            return row;
          }).toList();
    _originalHonorees = _currentHonorees();

    _days = event.extraDays
        .map((day) {
          final row = EventDayRow();
          row.nameController.text = day.name;
          row.date = DateTime.tryParse(day.dayDate);
          row.placeController.text = day.place ?? '';
          row.timeController.text = day.dayTime ?? '';
          return row;
        })
        .toList();
    _originalDays = collectEventDays(_days);
  }

  TextEditingController _controllerFor(String key) {
    return _controllers.putIfAbsent(key, () => TextEditingController());
  }

  List<Map<String, String>> _currentHonorees() {
    return _honorees
        .map((row) => {
              'name': row.nameController.text.trim(),
              'role': row.roleController.text.trim(),
            })
        .where((honoree) => honoree['name']!.isNotEmpty)
        .toList();
  }

  bool _honoreesChanged() {
    final current = _currentHonorees();
    if (current.length != _originalHonorees.length) return true;
    for (var i = 0; i < current.length; i++) {
      if (current[i]['name'] != _originalHonorees[i]['name'] ||
          current[i]['role'] != _originalHonorees[i]['role']) {
        return true;
      }
    }
    return false;
  }

  bool _daysChanged() {
    final current = collectEventDays(_days);
    if (current.length != _originalDays.length) return true;
    for (var i = 0; i < current.length; i++) {
      if (current[i]['name'] != _originalDays[i]['name'] ||
          current[i]['date'] != _originalDays[i]['date'] ||
          current[i]['place'] != _originalDays[i]['place'] ||
          current[i]['time'] != _originalDays[i]['time']) {
        return true;
      }
    }
    return false;
  }

  /// فروق الحقول عن قيمها الأصلية فقط — مفتاح غائب يعني «بلا تغيير» عند
  /// الخادم، فلا يُرسَل إطلاقاً بدل قيمة مكرَّرة.
  Map<String, dynamic> _computeChanges() {
    final changes = <String, dynamic>{};

    for (final key in kEventTextFieldKeys) {
      final value = _controllerFor(key).text.trim();
      if (value != (_originalText[key] ?? '')) changes[key] = value;
    }

    if (_town != _originalTown) changes['town'] = _town;

    // خارج البند الجامع لا يُرسَل شيء عن القرية — الخادم يمسحها وحده حين
    // تغادره البلدة (events.routes.js).
    if (_town == kVillagesTown) {
      if (_villageNotListed) {
        final name = _requestedVillageController.text.trim();
        if (name != _originalRequestedVillageName || _originalVillageId != null) {
          changes['requested_village_name'] = name;
        }
      } else if (_villageId != _originalVillageId) {
        changes['village_id'] = _villageId;
      }
      // تُرسَل عند تغييرها وحدها — والمفتاح الغائب يعني «بلا تعديل» عند
      // الخادم، فلا يُعاد كتابة ما لم يلمسه أحد.
      if (_regionId != _originalRegionId) changes['region_id'] = _regionId;
    }

    final eventDateText = _eventDate == null ? null : formatEventDate(_eventDate!);
    if (eventDateText != null && eventDateText != _originalEventDate) {
      changes['event_date'] = eventDateText;
    }

    final eventEndDateText = _eventEndDate == null ? null : formatEventDate(_eventEndDate!);
    if (eventEndDateText != _originalEventEndDate) {
      changes['event_end_date'] = eventEndDateText ?? '';
    }

    final youthDateText = _youthDate == null ? null : formatEventDate(_youthDate!);
    if (youthDateText != _originalYouthDate) {
      changes['youth_party_date'] = youthDateText ?? '';
    }

    if (_latitude != _originalLatitude) changes['latitude'] = _latitude ?? '';
    if (_longitude != _originalLongitude) changes['longitude'] = _longitude ?? '';

    // الظهور (تذكرة #166): مفتاح غائب = «بلا تعديل» كما في كل حقل آخر.
    if (_visibility != _originalVisibility) {
      changes['visibility'] = _visibility.wireValue;
    }

    // موعد النشر (تذكرة #167): يُرسَل عند تغييره وحده — وإعادة القيمة المخزَّنة
    // كما هي «بلا تعديل» عند الخادم أصلاً، فلا يُرسَل مفتاح لا معنى له.
    final publishAtText = _publishAt == null ? null : formatPublishAt(_publishAt!);
    if (publishAtText != null && publishAtText != _originalPublishAt) {
      changes['publish_at'] = publishAtText;
    }

    if (_honoreesChanged()) changes['honorees'] = _currentHonorees();

    // الأيام تُرسَل كاملها عند أي تغيير؛ غياب المفتاح يعني «بلا تعديل» عند
    // الخادم، والقائمة الفارغة تمسح كل الأيام. لا يُرسَل إلا لنوع يُظهرها.
    if ((_type?.showsField('extra_days') ?? false) && _daysChanged()) {
      changes['extra_days'] = collectEventDays(_days);
    }

    return changes;
  }

  Future<void> _pickDate({
    required DateTime? initial,
    required ValueChanged<DateTime> onPicked,
  }) async {
    final now = DateTime.now();
    final picked = await showDatePicker(
      context: context,
      initialDate: initial ?? now,
      firstDate: DateTime(now.year - 1),
      lastDate: DateTime(now.year + 3),
    );
    if (picked == null) return;
    setState(() => onPicked(picked));
  }

  Future<bool> _confirmCriticalChange() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('تنبيه قبل الحفظ'),
        content: const Text(
          'هذا التعديل يمسّ تاريخ المناسبة أو مكانها. عند الحفظ ستعود المناسبة '
          'إلى قائمة المراجعة وتختفي من أمام الناس حتى تُعتمد مجدداً من الإدارة. '
          'هل تريد المتابعة؟',
          style: TextStyle(height: 1.6),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(false),
            child: const Text('إلغاء'),
          ),
          ElevatedButton(
            onPressed: () => Navigator.of(dialogContext).pop(true),
            child: const Text('حفظ والمتابعة'),
          ),
        ],
      ),
    );
    return confirmed ?? false;
  }

  /// يحفظ التعديل، وإن ردّ الخادم بـ409 «تكرار محتمل» فتح **نافذة التأكيد
  /// نفسها** التي يستعملها النشر وأعاد الإرسال مع `confirm_duplicate` (تذكرة
  /// #159) — بلا نسخة ثانية من النافذة. `null` تعني أن المستخدم ألغى، فيبقى
  /// النموذج كما هو ولا يُغلق شيء.
  ///
  /// الأدمن وحده يرى هذا الـ409 — تعديل المالك لا يُوقَف أبداً، بل يعود
  /// للمراجعة إن وُجد شبه، ورسالة الخادم هي التي تشرح ذلك.
  Future<EventUpdateResult?> _updateWithDuplicateConfirmation(
    NegevApi api,
    Map<String, dynamic> changes,
  ) async {
    try {
      return await api.updateEvent(widget.event.id, fields: changes);
    } on PossibleDuplicateException catch (duplicate) {
      if (!mounted) return null;
      final anyway = await confirmPossibleDuplicateAction(
        context,
        duplicate,
        confirmLabel: 'حفظ رغم ذلك',
      );
      if (!anyway) return null;
    }
    return api.updateEvent(
      widget.event.id,
      fields: changes,
      confirmDuplicate: true,
    );
  }

  Future<void> _save() async {
    final changes = _computeChanges();
    if (changes.isEmpty) return;

    if (_town == kVillagesTown &&
        _villageNotListed &&
        _requestedVillageController.text.trim().isEmpty) {
      showMessage(context, 'اكتب اسم قريتك', isError: true);
      return;
    }
    // كالويب: إلزامية ما دام المنتقي ظاهراً (وصلت محافظات **نشطة**)، لا حين
    // يتعذّر وصولها من الخادم ولا حين تكون كلها موقوفة (تذكرة #127).
    if (_town == kVillagesTown &&
        AppServices.of(context).places.catalog.activeRegions.isNotEmpty &&
        _regionId == null) {
      showMessage(context, 'اختر المحافظة التي تنتمي إليها القرية', isError: true);
      return;
    }

    // نلتقط الخدمة قبل أي await حتى لا نلمس context بعد فجوة غير متزامنة —
    // نفس نمط شاشة النشر.
    final api = AppServices.of(context).api;

    final extraDaysAfter = changes['extra_days'] as List<Map<String, String>>?;
    final touchesReview =
        changes.keys.any(_fieldsThatMayTriggerReview.contains) ||
            (extraDaysAfter != null &&
                eventDaysPlacementChanged(_originalDays, extraDaysAfter));
    if (touchesReview) {
      final confirmed = await _confirmCriticalChange();
      if (!confirmed) return;
    }

    setState(() => _saving = true);

    try {
      final result = await _updateWithDuplicateConfirmation(api, changes);
      if (result == null || !mounted) return;

      setState(() {
        _status = result.status;
        _originalText = {
          for (final key in kEventTextFieldKeys) key: _controllerFor(key).text.trim(),
        };
        _originalTown = _town;
        if (_town == kVillagesTown) {
          _originalVillageId = _villageNotListed ? null : _villageId;
          _originalRequestedVillageName =
              _villageNotListed ? _requestedVillageController.text.trim() : '';
          _originalRegionId = _regionId;
        } else {
          _villageId = null;
          _villageNotListed = false;
          _originalVillageId = null;
          _originalRequestedVillageName = '';
          // الخادم يمسح محافظة القرية مع مغادرة البند الجامع — تبقى الحالة
          // المحلية مطابقة لما حُفظ فعلاً.
          _regionId = null;
          _originalRegionId = null;
        }
        _originalEventDate = _eventDate == null ? null : formatEventDate(_eventDate!);
        _originalEventEndDate = _eventEndDate == null ? null : formatEventDate(_eventEndDate!);
        _originalYouthDate = _youthDate == null ? null : formatEventDate(_youthDate!);
        _originalLatitude = _latitude;
        _originalLongitude = _longitude;
        _originalVisibility = _visibility;
        // ما حُفظ صار الأصل الجديد لموعد النشر أيضاً (#167).
        _originalPublishAt = _publishAt == null ? null : formatPublishAt(_publishAt!);
        _originalHonorees = _currentHonorees();
        _originalDays = collectEventDays(_days);
        _amendmentsFuture = api.eventAmendments(widget.event.id);
      });

      showMessage(context, composeEventUpdateMessage(result));
    } catch (error) {
      if (!mounted) return;
      // انتهت الجلسة: التعديلات تبقى في النموذج كما هي، وبعد الدخول يعود
      // المستخدم إليها ليحفظ من جديد.
      if (error is ApiException && error.isUnauthorized) {
        showMessage(context, AuthStore.sessionExpiredMessage, isError: true);
        Navigator.of(context).push(
          MaterialPageRoute(builder: (_) => const SignInScreen()),
        );
        return;
      }
      showMessage(context, '$error', isError: true);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final type = _type;
    final hasChanges = _computeChanges().isNotEmpty;

    return Scaffold(
      appBar: AppBar(
        title: const Text('تعديل المناسبة'),
        actions: [
          IconButton(
            icon: const Icon(Icons.history),
            tooltip: 'سجلّ التعديلات',
            onPressed: _showAmendmentLog,
          ),
          const AuthActionButton(),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 30),
        children: [
          Align(
            alignment: AlignmentDirectional.centerStart,
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
              decoration: BoxDecoration(
                color: eventStatusColor(context, _status).withValues(alpha: 0.14),
                borderRadius: BorderRadius.circular(10),
              ),
              child: Text(
                'الحالة الحالية: ${eventStatusLabel(_status)}',
                style: TextStyle(
                  fontSize: 12.5,
                  fontWeight: FontWeight.bold,
                  color: eventStatusColor(context, _status),
                ),
              ),
            ),
          ),
          const SizedBox(height: 16),
          _honoreesEditor(type),
          const SizedBox(height: 12),
          ..._textFieldWidget(type, 'title'),
          ..._textFieldWidget(type, 'family_clan'),
          // بلدة المناسبة الأصلية تبقى بنداً حتى لو لم يعد الخادم يعرضها — وإلا
          // سقط المنتقي بتأكيد «لا بند بهذه القيمة» قبل أن يلمسه أحد.
          //
          // والبنود بلدات **محافظة المناسبة نفسها** (+ اسمها مكاناً لمن لم
          // تُعرف بلدتها) لا بلدات محافظة أخرى، كما في النشر. والمناسبة التي
          // تقع في محافظةٍ لم تعد نشطة، أو ليست في الكتالوج الاحتياطي، تعود
          // لقائمة الخادم الشاملة، و`keep` يقيّد بلدتها بنفسه.
          DropdownButtonFormField<String>(
            initialValue: _town,
            decoration: InputDecoration(
              labelText: '${type?.labelFor('town') ?? 'البلدة'} *',
            ),
            items: eventTownOptions(
              AppServices.of(context).places.catalog,
              regionId: widget.event.regionId,
              keep: _originalTown,
            ).map((o) => DropdownMenuItem(value: o.value, child: Text(o.label))).toList(),
            onChanged: (value) {
              if (value == null) return;
              setState(() {
                _town = value;
                if (value != kVillagesTown) {
                  _villageId = null;
                  _villageNotListed = false;
                }
              });
            },
          ),
          if (_town == kVillagesTown) ..._villageEditor(),
          if (_town == kVillagesTown) ..._regionEditor(),
          const SizedBox(height: 12),
          FutureBuilder<Map<String, TownCoordinate>>(
            future: _townCoordsFuture,
            builder: (context, snapshot) {
              return LocationPickerMap(
                town: _town,
                townCoordinates: snapshot.data ?? const {},
                // المحافظات النشطة وحدها — مثل شاشة النشر بالحرف (تذكرة #127):
                // خريطة التعديل تفتح على مركز محافظة يُنشر فيها فعلاً. محافظة
                // المناسبة الموقوفة تبقى بنداً في المنسدل («المحافظة الحالية»،
                // قاعدة keep) لكن مركزها لم يعد يصل، فتفتح الخريطة على المنظر
                // العام بدل أن تدّعي مركزاً لا نعرفه.
                regions: AppServices.of(context).places.catalog.activeRegions,
                initialLatitude: widget.event.latitude,
                initialLongitude: widget.event.longitude,
                onChanged: (lat, lng) => setState(() {
                  _latitude = lat;
                  _longitude = lng;
                }),
              );
            },
          ),
          const SizedBox(height: 12),
          ..._textFieldWidget(type, 'location_name'),
          ..._textFieldWidget(type, 'secondary_location_name'),
          DateField(
            label: '${type?.labelFor('event_date') ?? 'تاريخ المناسبة'} *',
            value: _eventDate == null ? null : formatEventDate(_eventDate!),
            onTap: () => _pickDate(
              initial: _eventDate,
              onPicked: (date) => _eventDate = date,
            ),
          ),
          if (type?.showsField('event_end_date') ?? false) ...[
            const SizedBox(height: 12),
            DateField(
              label: type?.labelFor('event_end_date') ?? 'حتى تاريخ',
              value: _eventEndDate == null ? null : formatEventDate(_eventEndDate!),
              onTap: () => _pickDate(
                initial: _eventEndDate,
                onPicked: (date) => _eventEndDate = date,
              ),
            ),
          ],
          if (type?.showsField('youth_party_date') ?? false) ...[
            const SizedBox(height: 12),
            DateField(
              label: type?.labelFor('youth_party_date') ?? 'سهرة الشباب (اختياري)',
              value: _youthDate == null ? null : formatEventDate(_youthDate!),
              onTap: () => _pickDate(
                initial: _youthDate,
                onPicked: (date) => _youthDate = date,
              ),
            ),
          ],
          if (type?.showsField('extra_days') ?? false) ...[
            const SizedBox(height: 12),
            EventDaysEditor(
              label: eventProgramLabel,
              rows: _days,
              onChanged: () => setState(() {}),
              pickDate: _pickDate,
              rebuildOnEdit: true,
            ),
          ],
          const SizedBox(height: 12),
          ..._textFieldWidget(type, 'dinner_time'),
          ..._textFieldWidget(type, 'host_phone', keyboardType: TextInputType.phone),
          if (type?.showsField('poster_url') ?? false)
            _ReadOnlyMediaTile(
              icon: Icons.image_outlined,
              label: type?.labelFor('poster_url') ?? 'بوستر الدعوة',
              value: _posterUrl,
              subtitle:
                  (_posterUrl == null || _posterUrl!.isEmpty) && !_posterUploaded
                      ? 'لا يوجد — ارفع بطاقتك الجاهزة من الزرّ أدناه'
                      : 'بطاقة مرفوعة — يمكنك استبدالها من «ارفع بطاقتك الجاهزة»',
            ),
          if (type?.showsField('audio_url') ?? false) ...[
            const SizedBox(height: 10),
            _ReadOnlyMediaTile(
              icon: Icons.music_note_outlined,
              label: type?.labelFor('audio_url') ?? 'مقطع صوتي',
              value: widget.event.audioUrl,
            ),
            ..._textFieldWidget(type, 'audio_title'),
          ],
          // بابا بطاقة الدعوة (#181) — «صمّم بطاقة» يفتح الستوديو، وبجانبه
          // «ارفع بطاقتك الجاهزة» يرفع الملصق إلى المناسبة نفسها (PATCH
          // متعدد الأجزاء، حقل `poster`). موضعهما بعد حقلي الملصق والصوت لا
          // تحت «أزرار ملصق»: الملصق هنا بطاقة قراءة/عرض، لا أزرار. التصميم
          // ظاهر لكل الأنواع لأن البطاقة تُرسم من صفّ المناسبة؛ ورفع الملصق
          // يظهر فقط حين يُظهر النوع حقل poster_url. النشر لا يحملهما قبل
          // الإنشاء لأن المناسبة لا معرّف لها بعد.
          _cardDoors(type),
          const SizedBox(height: 12),
          EventVisibilityField(
            value: _visibility,
            onChanged: (value) => setState(() => _visibility = value),
          ),
          const SizedBox(height: 12),
          PublishAtField(
            value: _publishAt,
            onPick: () async {
              final picked = await pickPublishAt(context, initial: _publishAt);
              if (picked != null && mounted) setState(() => _publishAt = picked);
            },
          ),
          const SizedBox(height: 24),
          ElevatedButton.icon(
            key: const Key('save_event_button'),
            onPressed: (_saving || !hasChanges) ? null : _save,
            icon: _saving
                ? const SizedBox(
                    width: 18,
                    height: 18,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : const Icon(Icons.save_outlined),
            label: Text(_saving ? 'جارٍ الحفظ…' : 'حفظ التعديل'),
          ),
        ],
      ),
    );
  }

  /// منتقي القرية تحت البند الجامع — القائمة من الخادم (`GET /api/towns`)،
  /// وآخر بنودها «قريتي غير موجودة» بحقل اسم حرّ.
  List<Widget> _villageEditor() {
    _villagesFuture ??= AppServices.of(context).places.load().then((c) => c.villages);

    return [
      const SizedBox(height: 12),
      FutureBuilder<List<Village>>(
        future: _villagesFuture,
        builder: (context, snapshot) {
          final villages = snapshot.data ?? const <Village>[];
          Village? selected;
          for (final village in villages) {
            if (village.id == _villageId) selected = village;
          }
          return DropdownButtonFormField<Village>(
            // القائمة تصل بعد أول بناء — مفتاح جديد عند وصولها كي يلتقط
            // الحقل القرية الحالية بدل بقائه فارغاً.
            key: ValueKey('village_picker_${snapshot.hasData}'),
            initialValue: _villageNotListed ? kVillageNotListedOption : selected,
            decoration: const InputDecoration(labelText: 'القرية'),
            items: [
              ...villages.map(
                (village) => DropdownMenuItem(value: village, child: Text(village.name)),
              ),
              const DropdownMenuItem(
                value: kVillageNotListedOption,
                child: Text('قريتي غير موجودة ✎'),
              ),
            ],
            onChanged: (value) => setState(() {
              _villageNotListed = identical(value, kVillageNotListedOption);
              _villageId = _villageNotListed ? null : value?.id;
            }),
          );
        },
      ),
      if (_villageNotListed) ...[
        const SizedBox(height: 12),
        TextFormField(
          key: const Key('requested_village_name_field'),
          controller: _requestedVillageController,
          maxLength: kRequestedVillageNameMaxLength,
          onChanged: (_) => setState(() {}),
          decoration: const InputDecoration(labelText: 'اكتب اسم قريتك *'),
        ),
      ],
    ];
  }

  /// منتقي محافظة القرية (تذكرة #125) — بنوده من `GET /api/towns` وحده،
  /// ويبدأ بمحافظة المناسبة نفسها. **النشطة وحدها** بنداً (تذكرة #127): لا
  /// تُنقل قرية إلى محافظة موقوفة، ومحافظة عُطّلت بعد النشر تبقى بنداً باسم
  /// «المحافظة الحالية» كي لا يسقط المنتقي بقيمة خارج بنوده.
  List<Widget> _regionEditor() {
    final regions = AppServices.of(context).places.catalog.activeRegions;
    if (regions.isEmpty) return const [];

    final items = [
      for (final region in regions)
        DropdownMenuItem(value: region.id, child: Text(region.name)),
    ];
    final current = _regionId;
    if (current != null && !regions.any((region) => region.id == current)) {
      items.add(
        DropdownMenuItem(
          value: current,
          child: const Text('المحافظة الحالية'),
        ),
      );
    }

    return [
      const SizedBox(height: 12),
      DropdownButtonFormField<int>(
        key: const Key('edit_region_picker'),
        initialValue: current,
        decoration: const InputDecoration(labelText: 'المحافظة *'),
        items: items,
        onChanged: (value) => setState(() => _regionId = value),
      ),
    ];
  }

  /// بابا بطاقة الدعوة (#181) جنباً إلى جنب: «صمّم بطاقة» يفتح الستوديو لنبرة
  /// نوع المناسبة (من `tone` وحده، وما عدا `solemn` يُقرأ `festive`)، وبجانبه
  /// «ارفع بطاقتك الجاهزة» يرفع الملصق إلى الصفّ نفسه. `Wrap` لا `Row` لأن
  /// النصّين طويلان على الهواتف الضيقة، فيلتفّان بدل الفيض.
  Widget _cardDoors(OccasionType? type) {
    return Padding(
      padding: const EdgeInsets.only(top: 12),
      child: Wrap(
        spacing: 8,
        runSpacing: 8,
        children: [
          OutlinedButton.icon(
            key: const Key('edit_event_card_studio_button'),
            onPressed: _openCardStudio,
            icon: const Icon(Icons.auto_awesome_outlined, size: 18),
            label: const Text('صمّم بطاقة'),
          ),
          if (type?.showsField('poster_url') ?? false)
            OutlinedButton.icon(
              key: const Key('edit_event_ready_card_button'),
              onPressed: _uploadingReadyCard ? null : _uploadReadyCard,
              icon: const Icon(Icons.upload_file, size: 18),
              label: Text(
                _uploadingReadyCard ? 'جارٍ الرفع…' : 'ارفع بطاقتك الجاهزة',
              ),
            ),
        ],
      ),
    );
  }

  /// «ارفع بطاقتك الجاهزة» — يلتقط الملصق ويقصّه ٤:٥ بالمُساعد المشترك نفسه
  /// (`pickPosterImage`)، ثم يرفعه **وحده** بـ`PATCH /api/events/:id` متعدد
  /// الأجزاء (حقل `poster`). حفظ النموذج يبقى JSON ولا يمرّ من هنا.
  Future<void> _uploadReadyCard() async {
    if (_uploadingReadyCard) return;
    setState(() => _uploadingReadyCard = true);
    try {
      final picked = await pickPosterImage();
      if (picked == null || !mounted) return;
      final api = AppServices.of(context).api;
      final file = http.MultipartFile.fromBytes(
        'poster',
        await picked.readAsBytes(),
        filename: picked.name,
      );
      await api.updateEventPoster(widget.event.id, poster: file);
      // الردّ لا يحمل `poster_url`؛ نعيد جلب الصفّ ليُعرض الملصق الجديد فعلاً.
      // فشل الجلب وحده لا يُلغي نجاح الرفع، فتبقى الرسالة ناجحة و`_posterUploaded`
      // يعلّم أن ملصقاً صار موجوداً حتى لو تعذّر تحديث الرابط.
      String? refreshed;
      try {
        refreshed = (await api.eventDetails(widget.event.id)).posterUrl;
      } catch (_) {}
      if (!mounted) return;
      setState(() {
        _posterUrl = refreshed ?? _posterUrl;
        _posterUploaded = true;
      });
      showMessage(context, 'حُدّثت البطاقة الجاهزة — صارت ملصق المناسبة');
    } catch (error) {
      if (mounted) showMessage(context, '$error', isError: true);
    } finally {
      if (mounted) setState(() => _uploadingReadyCard = false);
    }
  }

  Future<void> _openCardStudio() async {
    // نتيجة المسار (آخر بطاقة حُفظت) لا تُستهلك هنا: البطاقة تُحفظ على
    // الخادم وتصير `og:image` للمناسبة، والحقول المحلية لا تتغيّر.
    await Navigator.of(context).push(
      MaterialPageRoute<EventCardItem?>(
        builder: (_) => CardStudioScreen(
          eventId: widget.event.id,
          tone: _type?.tone ?? 'festive',
          eventTitle: widget.event.displayTitle,
        ),
      ),
    );
  }

  Widget _honoreesEditor(OccasionType? type) {
    final label = type?.labelFor('honorees') ?? 'أصحاب المناسبة';

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text('$label *', style: TextStyle(color: context.c.inkSoft, fontSize: 13)),
        const SizedBox(height: 8),
        ..._honorees.asMap().entries.map((entry) {
          final index = entry.key;
          final row = entry.value;
          return Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(
                  flex: 3,
                  child: TextFormField(
                    controller: row.nameController,
                    onChanged: (_) => setState(() {}),
                    decoration: InputDecoration(
                      labelText: index == 0 ? label : '$label ${index + 1}',
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  flex: 2,
                  child: TextFormField(
                    controller: row.roleController,
                    onChanged: (_) => setState(() {}),
                    decoration: const InputDecoration(labelText: 'الصفة (اختياري)'),
                  ),
                ),
                if (_honorees.length > 1)
                  IconButton(
                    icon: Icon(Icons.remove_circle_outline, color: context.c.inkFaint),
                    tooltip: 'حذف',
                    onPressed: () => setState(() => _honorees.removeAt(index).dispose()),
                  ),
              ],
            ),
          );
        }),
        TextButton.icon(
          onPressed: () => setState(() => _honorees.add(HonoreeRow())),
          icon: const Icon(Icons.add, size: 18),
          label: Text('إضافة $label'),
        ),
      ],
    );
  }

  List<Widget> _textFieldWidget(
    OccasionType? type,
    String key, {
    int maxLines = 1,
    TextInputType? keyboardType,
  }) {
    if (!(type?.showsField(key) ?? false)) return const [];
    final label = type?.labelFor(key) ?? key;
    final required = type?.isRequiredField(key) ?? false;

    return [
      Padding(
        padding: const EdgeInsets.only(bottom: 12),
        child: TextFormField(
          key: Key('event_field_$key'),
          controller: _controllerFor(key),
          maxLines: maxLines,
          keyboardType: keyboardType,
          onChanged: (_) => setState(() {}),
          decoration: InputDecoration(
            labelText: required ? '$label *' : label,
            hintText: kEventFieldHints[key],
          ),
        ),
      ),
    ];
  }

  void _showAmendmentLog() {
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: context.c.surfaceSunk,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(22)),
      ),
      builder: (sheetContext) => _AmendmentLogSheet(
        future: _amendmentsFuture!,
        labelFor: (field) =>
            _type?.labelFor(field) ?? _amendmentFieldFallbackLabels[field] ?? field,
      ),
    );
  }
}

class _ReadOnlyMediaTile extends StatelessWidget {
  const _ReadOnlyMediaTile({
    required this.icon,
    required this.label,
    required this.value,
    this.subtitle,
  });

  final IconData icon;
  final String label;
  final String? value;

  /// نصّ الحالة حين يختلف عن الافتراضي — الملصق بعده صار قابلاً للاستبدال من
  /// الباب المجاور، فلا يوصف بـ«غير قابل للتعديل».
  final String? subtitle;

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 6),
      decoration: BoxDecoration(
        color: context.c.surface,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: context.c.line),
      ),
      // `Material` شفاف داخل الحاوية الملوّنة — نفس إصلاح `_FilePickTile`:
      // بدونه يرى `ListTile` الـ`DecoratedBox` بينه وبين `Material` الأب في
      // debug ويحذّر أن خلفيته/رذاذ الحبر قد تختفي.
      child: Material(
        type: MaterialType.transparency,
        child: ListTile(
          leading: Icon(icon, color: context.c.inkFaint),
          title: Text(label, style: const TextStyle(fontSize: 14.5)),
          subtitle: Text(
            subtitle ??
                (value == null || value!.isEmpty
                    ? 'لا يوجد'
                    : 'غير قابل للتعديل من هذه الشاشة'),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(fontSize: 12, color: context.c.inkFaint),
          ),
        ),
      ),
    );
  }
}

class _AmendmentLogSheet extends StatelessWidget {
  const _AmendmentLogSheet({required this.future, required this.labelFor});

  final Future<List<Amendment>> future;
  final String Function(String field) labelFor;

  String _statusLabel(String status) {
    switch (status) {
      case 'approved':
        return 'معتمد';
      case 'rejected':
        return 'مرفوض';
      default:
        return 'قيد المراجعة';
    }
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(
        left: 18,
        right: 18,
        top: 20,
        bottom: MediaQuery.of(context).viewInsets.bottom + 20,
      ),
      child: FutureBuilder<List<Amendment>>(
        future: future,
        builder: (context, snapshot) {
          if (snapshot.connectionState == ConnectionState.waiting) {
            return const SizedBox(
              height: 160,
              child: Center(child: CircularProgressIndicator()),
            );
          }

          final amendments = snapshot.data ?? const <Amendment>[];

          return ConstrainedBox(
            constraints: BoxConstraints(maxHeight: MediaQuery.of(context).size.height * 0.75),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text(
                  'سجلّ التعديلات',
                  style: TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.bold,
                    color: context.c.ink,
                  ),
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 14),
                if (amendments.isEmpty)
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: 18),
                    child: Text(
                      'لا يوجد أي تعديل على هذه المناسبة بعد',
                      textAlign: TextAlign.center,
                      style: TextStyle(color: context.c.inkFaint),
                    ),
                  )
                else
                  Flexible(
                    child: ListView.builder(
                      shrinkWrap: true,
                      itemCount: amendments.length,
                      itemBuilder: (context, index) {
                        final amendment = amendments[index];
                        return Container(
                          margin: const EdgeInsets.only(bottom: 10),
                          padding: const EdgeInsets.all(13),
                          decoration: BoxDecoration(
                            color: context.c.surface,
                            borderRadius: BorderRadius.circular(14),
                            border: Border.all(color: context.c.line),
                          ),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Row(
                                children: [
                                  Expanded(
                                    child: Text(
                                      labelFor(amendment.field),
                                      style: TextStyle(
                                        fontWeight: FontWeight.bold,
                                        color: context.c.ink,
                                      ),
                                    ),
                                  ),
                                  Text(
                                    _statusLabel(amendment.status),
                                    style: TextStyle(
                                      fontSize: 11.5,
                                      color: amendment.isCritical
                                          ? context.c.warn
                                          : context.c.success,
                                    ),
                                  ),
                                ],
                              ),
                              const SizedBox(height: 6),
                              Text(
                                '${amendment.oldValue ?? '—'}  ←  ${amendment.newValue ?? '—'}',
                                style: TextStyle(color: context.c.inkSoft, fontSize: 13),
                              ),
                              if (amendment.createdAt != null) ...[
                                const SizedBox(height: 4),
                                Text(
                                  amendment.createdAt!,
                                  style: TextStyle(fontSize: 11, color: context.c.inkFaint),
                                ),
                              ],
                            ],
                          ),
                        );
                      },
                    ),
                  ),
              ],
            ),
          );
        },
      ),
    );
  }
}
