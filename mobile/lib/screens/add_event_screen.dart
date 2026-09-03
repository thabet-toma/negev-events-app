import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:image_picker/image_picker.dart';

import '../api/negev_api.dart';
import '../config.dart';
import '../main.dart';
import '../models/event.dart';
import '../state/analytics.dart';
import '../theme.dart';
import '../widgets/async_view.dart';
import '../widgets/location_picker_map.dart';
import 'account_screen.dart';

/// رسالة النشر النهائية — التحذير (إن وُجد) يُلحَق بنص الخادم كما هو، بلا
/// إعادة صياغة. دالة عامة صِرفة لتبقى قابلة للاختبار دون تركيب الشاشة كاملة.
String composeEventSubmitMessage(EventSubmissionResult result) {
  return result.locationWarning == null
      ? result.message
      : '${result.message}\n${result.locationWarning}';
}

/// حقلا الإحداثيات المرسَلان مع النشر — غائبان تماماً بلا دبّوس، لا صفرَين:
/// الخادم يقع حينها على مركز البلدة المختارة بنفسه (events.service.js
/// createEvent). دالة عامة صِرفة لنفس سبب التي فوقها.
Map<String, String> buildLocationFields({double? latitude, double? longitude}) {
  if (latitude == null || longitude == null) return const {};
  return {'latitude': '$latitude', 'longitude': '$longitude'};
}

/// يميّز فشل نشر بسبب الصورة/الملف عن أي فشل نشر آخر — لا كود خطأ مخصَّص
/// يرجعه الخادم، فقط نص الرسالة الذي يبنيه بالضبط server/src/middleware/error.js
/// لأخطاء multer الثلاثة (حجم الملف، النوع غير المدعوم، أو خطأ رفع عام).
/// نفس المنطق حرفياً الذي يستعمله web/app.js (isMediaUploadErrorMessage) —
/// إن تغيّرت تلك الرسائل يوماً يفقد هذا التمييز دقّته لا أكثر، فيُسجَّل
/// الفشل حينها كـ publish_failed العام بدل image_upload_failed. دالة عامة
/// صِرفة كبقية الدوال أعلاه لتبقى قابلة للاختبار دون تركيب الشاشة كاملة.
bool isMediaUploadErrorMessage(String? message) {
  if (message == null) return false;
  return message.contains('حجم الملف') ||
      message.contains('نوع الملف غير مدعوم') ||
      message.contains('خطأ في رفع الملف');
}

/// مفاتيح الحقول النصية العادية القابلة للتعديل بلا معالجة خاصة — البقية
/// (honorees، town، التواريخ، poster_url، audio_url، artist_image_url) لها
/// معالجة خاصة في كل من شاشتي النشر والتعديل. عام كي تعيد شاشة تعديل
/// المناسبة استعماله بدل نسخة ثانية من نفس القائمة.
///
/// `artist_name` فيها كأي حقل نصّي آخر عمداً — تُظهره `type.showsField` فقط
/// حين يُشعله إعداد النوع (عرس وخطوبة اليوم)، بلا فرع `if (type == wedding)`
/// في أي مكان (spec #21 خطوة ٢).
const kEventTextFieldKeys = [
  'title',
  'family_clan',
  'artist_name',
  'location_name',
  'secondary_location_name',
  'dinner_time',
  'audio_title',
  'host_phone',
];

/// بند القرى والتجمعات الجامع — نفس النصّ الحرفي في `AppConfig.towns` وفي
/// `VILLAGES_TOWN` على الخادم. اختياره وحده يُظهر منتقي القرية الإلزامي.
const kVillagesTown = 'القرى والتجمعات';

/// صيغة `YYYY-MM-DD` التي يفهمها الخادم — عام كي تعيد شاشة تعديل المناسبة
/// استعماله بدل نسخة ثانية.
String formatEventDate(DateTime date) {
  final month = date.month.toString().padLeft(2, '0');
  final day = date.day.toString().padLeft(2, '0');
  return '${date.year}-$month-$day';
}

/// صف اسم/صفة واحد من أصحاب المناسبة — عرس له عريس (وربما عروس)، عزاء له
/// متوفَّى، وهكذا. اسم واحد على الأقل مطلوب أياً كان النوع. عام كي تعيد
/// شاشة تعديل المناسبة استعماله بدل نسخة ثانية.
class HonoreeRow {
  final nameController = TextEditingController();
  final roleController = TextEditingController();

  void dispose() {
    nameController.dispose();
    roleController.dispose();
  }
}

/// تقديم مناسبة جديدة. تدخل قائمة المراجعة — الاعتماد من لوحة الإدارة.
///
/// النموذج كله يُبنى من `GET /api/occasion-types`: لا نوع ثابت، ولا تسمية
/// حقل ثابتة — كل ذلك من إعداد النوع المختار.
class AddEventScreen extends StatefulWidget {
  const AddEventScreen({super.key});

  @override
  State<AddEventScreen> createState() => _AddEventScreenState();
}

class _AddEventScreenState extends State<AddEventScreen> {
  Future<List<OccasionType>>? _typesFuture;
  Future<Map<String, TownCoordinate>>? _townCoordsFuture;
  Future<List<Village>>? _villagesFuture;
  OccasionType? _type;

  final Map<String, TextEditingController> _controllers = {};
  final List<HonoreeRow> _honorees = [HonoreeRow()];

  String _town = AppConfig.towns.first;
  // إلزامي فقط تحت بند القرى والتجمعات — `_validate` يرفض النشر بدونه هناك.
  Village? _selectedVillage;
  DateTime? _eventDate;
  DateTime? _eventEndDate;
  DateTime? _youthDate;
  double? _latitude;
  double? _longitude;
  // يتغيّر بعد كل نشر ناجح ليُجبر منتقي الخريطة على إعادة بناء كاملة —
  // وإلا بقي دبّوسه الداخلي معروضاً رغم تصفير _latitude/_longitude هنا.
  int _locationPickerGeneration = 0;

  XFile? _poster;
  PlatformFile? _audio;
  XFile? _artistImage;

  bool _submitting = false;
  List<Event> _conflicts = const [];
  bool _checkingCollision = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _typesFuture ??= AppServices.of(context).api.listOccasionTypes();
    _townCoordsFuture ??= AppServices.of(context).api.townCoordinates();
    _villagesFuture ??= AppServices.of(context).api.listVillages();
  }

  @override
  void dispose() {
    for (final controller in _controllers.values) {
      controller.dispose();
    }
    for (final row in _honorees) {
      row.dispose();
    }
    super.dispose();
  }

  TextEditingController _controllerFor(String key) {
    return _controllers.putIfAbsent(key, () {
      final controller = TextEditingController();
      if (key == 'dinner_time') controller.text = 'الساعة 8:00 مساءً';
      return controller;
    });
  }

  Future<void> _pickDate({
    required DateTime? initial,
    required ValueChanged<DateTime> onPicked,
    bool checkCollisionAfter = false,
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
    if (checkCollisionAfter) await _checkCollision();
  }

  /// يحذّر من تعارض تاريخ في نفس البلدة قبل الإرسال — نفس سلوك الويب.
  Future<void> _checkCollision() async {
    if (_eventDate == null) return;

    setState(() => _checkingCollision = true);
    try {
      final conflicts = await AppServices.of(context).api.checkCollision(
            date: formatEventDate(_eventDate!),
            town: _town,
          );
      if (mounted) setState(() => _conflicts = conflicts);
    } catch (_) {
      // فحص التعارض مساعد فقط — لا يمنع الإرسال.
    } finally {
      if (mounted) setState(() => _checkingCollision = false);
    }
  }

  Future<void> _pickPoster() async {
    final picked = await ImagePicker().pickImage(
      source: ImageSource.gallery,
      imageQuality: 85,
    );
    if (picked != null) setState(() => _poster = picked);
  }

  Future<void> _pickAudio() async {
    final picked = await FilePicker.pickFile(type: FileType.audio);
    if (picked != null) setState(() => _audio = picked);
  }

  Future<void> _pickArtistImage() async {
    final picked = await ImagePicker().pickImage(
      source: ImageSource.gallery,
      imageQuality: 85,
    );
    if (picked != null) setState(() => _artistImage = picked);
  }

  String? _validate(OccasionType type) {
    final honoreeNames = _honorees
        .map((row) => row.nameController.text.trim())
        .where((name) => name.isNotEmpty)
        .toList();
    if (honoreeNames.isEmpty) {
      return '${type.labelFor('honorees') ?? 'أصحاب المناسبة'} مطلوب';
    }

    if (!AppConfig.towns.contains(_town)) {
      return '${type.labelFor('town') ?? 'البلدة'} مطلوبة';
    }

    // قاعدة تكامل خادمية مطابَقة هنا: قرية إلزامية لنشر جديد تحت البند
    // الجامع فقط، والخادم يرفض غيابها بـ400 (spec #21 «المخطط»).
    if (_town == kVillagesTown && _selectedVillage == null) {
      return 'يرجى اختيار القرية';
    }

    if (_eventDate == null) {
      return '${type.labelFor('event_date') ?? 'تاريخ المناسبة'} مطلوب';
    }

    for (final key in kEventTextFieldKeys) {
      if (!type.isRequiredField(key)) continue;
      if (_controllerFor(key).text.trim().isEmpty) {
        return '${type.labelFor(key) ?? key} مطلوب';
      }
    }

    if (type.isRequiredField('event_end_date') && _eventEndDate == null) {
      return '${type.labelFor('event_end_date') ?? 'تاريخ الانتهاء'} مطلوب';
    }
    if (type.isRequiredField('youth_party_date') && _youthDate == null) {
      return '${type.labelFor('youth_party_date') ?? 'سهرة الشباب'} مطلوب';
    }

    return null;
  }

  Future<void> _submit(OccasionType type) async {
    final auth = AppServices.of(context).auth;
    if (!auth.isSignedIn) {
      showMessage(context, 'سجّل الدخول لنشر مناسبة', isError: true);
      await Navigator.of(context).push(
        MaterialPageRoute(builder: (_) => const SignInScreen()),
      );
      return;
    }

    final error = _validate(type);
    if (error != null) {
      showMessage(context, error, isError: true);
      return;
    }

    setState(() => _submitting = true);
    // نلتقط الخدمة قبل أي await حتى لا نلمس context بعد فجوة غير متزامنة.
    final api = AppServices.of(context).api;
    // بلدة *المناسبة* المنشورة، لا بلدة المستخدم — نفس تمييز _share في
    // event_details_screen.dart، وبلدة القيد الفعلية للمنشور دائماً (issue #44).
    recordAnalyticsEvent(api, 'publish_started', contentTown: _town);

    try {
      final fields = <String, String>{
        'town': _town,
        'event_date': formatEventDate(_eventDate!),
      };
      for (final key in kEventTextFieldKeys) {
        if (!type.showsField(key)) continue;
        final value = _controllerFor(key).text.trim();
        if (value.isNotEmpty) fields[key] = value;
      }
      fields.addAll(buildLocationFields(latitude: _latitude, longitude: _longitude));
      if (_town == kVillagesTown && _selectedVillage != null) {
        fields['village_id'] = '${_selectedVillage!.id}';
      }
      if (type.showsField('event_end_date') && _eventEndDate != null) {
        fields['event_end_date'] = formatEventDate(_eventEndDate!);
      }
      if (type.showsField('youth_party_date') && _youthDate != null) {
        fields['youth_party_date'] = formatEventDate(_youthDate!);
      }

      http.MultipartFile? posterFile;
      if (type.showsField('poster_url') && _poster != null) {
        posterFile = http.MultipartFile.fromBytes(
          'poster',
          await _poster!.readAsBytes(),
          filename: _poster!.name,
        );
      }

      http.MultipartFile? audioFile;
      if (type.showsField('audio_url') && _audio != null) {
        audioFile = http.MultipartFile.fromBytes(
          'audio',
          await _audio!.readAsBytes(),
          filename: _audio!.name,
        );
      }

      http.MultipartFile? artistImageFile;
      if (type.showsField('artist_image_url') && _artistImage != null) {
        artistImageFile = http.MultipartFile.fromBytes(
          'artist_image',
          await _artistImage!.readAsBytes(),
          filename: _artistImage!.name,
        );
      }

      final honorees = _honorees
          .map((row) => {
                'name': row.nameController.text.trim(),
                'role': row.roleController.text.trim(),
              })
          .toList();

      final result = await api.submitEvent(
        occasionTypeId: type.id,
        honorees: honorees,
        fields: fields,
        poster: posterFile,
        audio: audioFile,
        artistImage: artistImageFile,
      );

      if (!mounted) return;
      // التحذير ليّن وغير حاجب — المناسبة حُفظت فعلاً بالبلدة التي اختارها
      // المستخدم، ونصّه يصل كما أرسله الخادم دون إعادة صياغة.
      showMessage(context, composeEventSubmitMessage(result));
      _reset();
    } catch (error) {
      // فشل بسبب الصورة/الملف تحديداً يُسجَّل باسمه الخاص لا كفشل نشر عام —
      // الاثنان مفتاحان منفصلان في القائمة المغلقة (ANALYTICS_EVENTS).
      recordAnalyticsEvent(
        api,
        isMediaUploadErrorMessage('$error') ? 'image_upload_failed' : 'publish_failed',
        contentTown: _town,
      );
      if (mounted) showMessage(context, '$error', isError: true);
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  void _reset() {
    for (final controller in _controllers.values) {
      controller.clear();
    }
    _controllerFor('dinner_time').text = 'الساعة 8:00 مساءً';
    for (final row in _honorees) {
      row.dispose();
    }
    setState(() {
      _honorees
        ..clear()
        ..add(HonoreeRow());
      _eventDate = null;
      _eventEndDate = null;
      _youthDate = null;
      _poster = null;
      _audio = null;
      _artistImage = null;
      _conflicts = const [];
      _town = AppConfig.towns.first;
      _selectedVillage = null;
      _latitude = null;
      _longitude = null;
      _locationPickerGeneration++;
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('إعلان مناسبة')),
      body: FutureBuilder<List<OccasionType>>(
        future: _typesFuture,
        builder: (context, snapshot) {
          return AsyncView<List<OccasionType>>(
            snapshot: snapshot,
            onRetry: () => setState(
              () => _typesFuture = AppServices.of(context).api.listOccasionTypes(),
            ),
            isEmpty: (data) => data.isEmpty,
            emptyMessage: 'لا توجد أنواع مناسبات متاحة للنشر حالياً',
            builder: _buildForm,
          );
        },
      ),
    );
  }

  Widget _buildForm(List<OccasionType> types) {
    _type ??= types.first;
    final type = _type!;

    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 30),
      children: [
        const _Note(
          text:
              'المناسبة تدخل قائمة المراجعة، ويتم نشرها بعد اعتماد الإدارة.',
        ),
        const SizedBox(height: 16),
        DropdownButtonFormField<OccasionType>(
          initialValue: type,
          decoration: const InputDecoration(labelText: 'نوع المناسبة *'),
          items: types
              .map(
                (item) => DropdownMenuItem(
                  value: item,
                  child: Text(
                    item.icon.isEmpty ? item.name : '${item.icon} ${item.name}',
                  ),
                ),
              )
              .toList(),
          onChanged: (value) {
            if (value != null) setState(() => _type = value);
          },
        ),
        const SizedBox(height: 16),
        _honoreesEditor(type),
        const SizedBox(height: 12),
        // العنوان حقل حرّ حين يُظهره النوع؛ تركه بلا واجهة يجعل نوعاً يوسمه
        // إجبارياً غير قابل للنشر إطلاقاً — والخادم يولّده وحده عند الفراغ.
        ..._textFieldWidget(type, 'title'),
        ..._textFieldWidget(type, 'family_clan'),
        // الفنان: حقل نصّ وصورة اختيارية كأي حقلين آخرين — يظهران فقط حين
        // يُشعلهما إعداد هذا النوع تحديداً (عرس وخطوبة اليوم)، بلا فرع خاص.
        ..._textFieldWidget(type, 'artist_name'),
        if (type.showsField('artist_image_url')) ...[
          const SizedBox(height: 6),
          _FilePickTile(
            icon: Icons.image_outlined,
            label: type.labelFor('artist_image_url') ?? 'صورة الفنان',
            value: _artistImage?.name,
            onPick: _pickArtistImage,
            onClear: () => setState(() => _artistImage = null),
          ),
          const SizedBox(height: 12),
        ],
        DropdownButtonFormField<String>(
          initialValue: _town,
          decoration: InputDecoration(
            labelText: '${type.labelFor('town') ?? 'البلدة'} *',
          ),
          items: AppConfig.towns
              .map((town) => DropdownMenuItem(value: town, child: Text(town)))
              .toList(),
          onChanged: (value) {
            if (value == null) return;
            setState(() {
              _town = value;
              // مغادرة البند الجامع تُبطل أي قرية مختارة تحته — نفس القاعدة
              // التي يفرضها الخادم (village_id غير NULL فقط تحت هذا البند).
              if (value != kVillagesTown) _selectedVillage = null;
            });
            _checkCollision();
          },
        ),
        if (_town == kVillagesTown) ...[
          const SizedBox(height: 12),
          FutureBuilder<List<Village>>(
            future: _villagesFuture,
            builder: (context, snapshot) {
              final villages = snapshot.data ?? const <Village>[];
              return DropdownButtonFormField<Village>(
                initialValue: _selectedVillage,
                decoration: const InputDecoration(labelText: 'القرية *'),
                items: villages
                    .map((village) => DropdownMenuItem(value: village, child: Text(village.name)))
                    .toList(),
                onChanged: (value) => setState(() => _selectedVillage = value),
              );
            },
          ),
        ],
        const SizedBox(height: 12),
        FutureBuilder<Map<String, TownCoordinate>>(
          future: _townCoordsFuture,
          builder: (context, snapshot) {
            // القرية المختارة تُعيد توسيط الخريطة على مركزها بدل مركز البند
            // الجامع (الذي لا مركز واحداً له أصلاً) — بلا تعديل على
            // LocationPickerMap نفسه: مجرّد استبدال مؤقّت لمدخل هذا البند
            // في خريطة الإحداثيات التي يقرأها.
            final coords = Map<String, TownCoordinate>.from(snapshot.data ?? const {});
            if (_town == kVillagesTown && _selectedVillage != null) {
              coords[kVillagesTown] = TownCoordinate(
                lat: _selectedVillage!.latitude,
                lng: _selectedVillage!.longitude,
              );
            }
            return LocationPickerMap(
              key: ValueKey(_locationPickerGeneration),
              town: _town,
              townCoordinates: coords,
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
          label: '${type.labelFor('event_date') ?? 'تاريخ المناسبة'} *',
          value: _eventDate == null ? null : formatEventDate(_eventDate!),
          onTap: () => _pickDate(
            initial: _eventDate,
            onPicked: (date) => _eventDate = date,
            checkCollisionAfter: true,
          ),
        ),
        if (_checkingCollision)
          const Padding(
            padding: EdgeInsets.only(top: 8),
            child: LinearProgressIndicator(minHeight: 2),
          ),
        if (_conflicts.isNotEmpty) _CollisionWarning(conflicts: _conflicts),
        if (type.showsField('event_end_date')) ...[
          const SizedBox(height: 12),
          DateField(
            label: type.labelFor('event_end_date') ?? 'حتى تاريخ',
            value: _eventEndDate == null ? null : formatEventDate(_eventEndDate!),
            onTap: () => _pickDate(
              initial: _eventEndDate,
              onPicked: (date) => _eventEndDate = date,
            ),
          ),
        ],
        if (type.showsField('youth_party_date')) ...[
          const SizedBox(height: 12),
          DateField(
            label: type.labelFor('youth_party_date') ?? 'سهرة الشباب (اختياري)',
            value: _youthDate == null ? null : formatEventDate(_youthDate!),
            onTap: () => _pickDate(
              initial: _youthDate,
              onPicked: (date) => _youthDate = date,
            ),
          ),
        ],
        const SizedBox(height: 12),
        ..._textFieldWidget(type, 'dinner_time'),
        ..._textFieldWidget(
          type,
          'host_phone',
          keyboardType: TextInputType.phone,
        ),
        if (type.showsField('poster_url')) ...[
          const SizedBox(height: 6),
          _FilePickTile(
            icon: Icons.image_outlined,
            label: type.labelFor('poster_url') ?? 'بوستر الدعوة',
            value: _poster?.name,
            onPick: _pickPoster,
            onClear: () => setState(() => _poster = null),
          ),
        ],
        if (type.showsField('audio_url')) ...[
          const SizedBox(height: 10),
          _FilePickTile(
            icon: Icons.music_note_outlined,
            label: type.labelFor('audio_url') ?? 'مقطع صوتي',
            value: _audio?.name,
            onPick: _pickAudio,
            onClear: () => setState(() => _audio = null),
          ),
          ..._textFieldWidget(type, 'audio_title'),
        ],
        const SizedBox(height: 24),
        ElevatedButton.icon(
          onPressed: _submitting ? null : () => _submit(type),
          icon: _submitting
              ? const SizedBox(
                  width: 18,
                  height: 18,
                  child: CircularProgressIndicator(strokeWidth: 2),
                )
              : const Icon(Icons.send),
          label: Text(_submitting ? 'جارٍ الإرسال…' : 'إرسال المناسبة'),
        ),
      ],
    );
  }

  Widget _honoreesEditor(OccasionType type) {
    final label = type.labelFor('honorees') ?? 'أصحاب المناسبة';

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          '$label *',
          style: TextStyle(color: context.c.inkSoft, fontSize: 13),
        ),
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
                    decoration: const InputDecoration(labelText: 'الصفة (اختياري)'),
                  ),
                ),
                if (_honorees.length > 1)
                  IconButton(
                    icon: Icon(
                      Icons.remove_circle_outline,
                      color: context.c.inkFaint,
                    ),
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
    OccasionType type,
    String key, {
    int maxLines = 1,
    TextInputType? keyboardType,
  }) {
    if (!type.showsField(key)) return const [];
    final label = type.labelFor(key) ?? key;
    final required = type.isRequiredField(key);

    return [
      Padding(
        padding: const EdgeInsets.only(bottom: 12),
        child: TextFormField(
          controller: _controllerFor(key),
          maxLines: maxLines,
          keyboardType: keyboardType,
          decoration: InputDecoration(labelText: required ? '$label *' : label),
        ),
      ),
    ];
  }
}

class _Note extends StatelessWidget {
  const _Note({required this.text});

  final String text;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(13),
      decoration: BoxDecoration(
        color: context.c.surface,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: context.c.line),
      ),
      child: Row(
        children: [
          Icon(Icons.info_outline, size: 18, color: context.c.sky),
          const SizedBox(width: 9),
          Expanded(
            child: Text(
              text,
              style: TextStyle(
                fontSize: 13,
                color: context.c.inkSoft,
                height: 1.5,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// عام كي تعيد شاشة تعديل المناسبة استعماله بدل نسخة ثانية.
class DateField extends StatelessWidget {
  const DateField({
    super.key,
    required this.label,
    required this.value,
    required this.onTap,
  });

  final String label;
  final String? value;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(14),
      child: InputDecorator(
        decoration: InputDecoration(
          labelText: label,
          suffixIcon: const Icon(Icons.calendar_today, size: 18),
        ),
        child: Text(
          value ?? 'اختر التاريخ',
          style: TextStyle(
            color: value == null ? context.c.inkFaint : context.c.ink,
          ),
        ),
      ),
    );
  }
}

class _CollisionWarning extends StatelessWidget {
  const _CollisionWarning({required this.conflicts});

  final List<Event> conflicts;

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(top: 10),
      padding: const EdgeInsets.all(13),
      decoration: BoxDecoration(
        color: context.c.warnWash,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: context.c.warn),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(Icons.warning_amber, size: 18, color: context.c.warn),
              const SizedBox(width: 8),
              Text(
                'تنبيه: ${conflicts.length} مناسبة في نفس التاريخ',
                style: TextStyle(
                  color: context.c.warn,
                  fontWeight: FontWeight.bold,
                  fontSize: 13.5,
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          ...conflicts.take(4).map(
                (event) => Padding(
                  padding: const EdgeInsets.only(bottom: 4),
                  child: Text(
                    '• ${event.displayTitle} — ${event.town}',
                    style: TextStyle(
                      fontSize: 12.5,
                      color: context.c.inkSoft,
                    ),
                  ),
                ),
              ),
        ],
      ),
    );
  }
}

class _FilePickTile extends StatelessWidget {
  const _FilePickTile({
    required this.icon,
    required this.label,
    required this.value,
    required this.onPick,
    required this.onClear,
  });

  final IconData icon;
  final String label;
  final String? value;
  final VoidCallback onPick;
  final VoidCallback onClear;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: context.c.surface,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: context.c.line),
      ),
      child: ListTile(
        leading: Icon(icon, color: context.c.sky),
        title: Text(label, style: const TextStyle(fontSize: 14.5)),
        subtitle: Text(
          value ?? 'لم يُختر ملف',
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: TextStyle(fontSize: 12, color: context.c.inkFaint),
        ),
        trailing: value == null
            ? IconButton(
                icon: Icon(Icons.upload_file, color: context.c.sky),
                onPressed: onPick,
                tooltip: 'اختيار',
              )
            : IconButton(
                icon: Icon(Icons.close, color: context.c.inkFaint),
                onPressed: onClear,
                tooltip: 'إزالة',
              ),
        onTap: value == null ? onPick : null,
      ),
    );
  }
}
