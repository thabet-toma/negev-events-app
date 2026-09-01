import 'package:flutter/material.dart';

import '../api/negev_api.dart';
import '../config.dart';
import '../main.dart';
import '../models/event.dart';
import '../theme.dart';
import '../widgets/async_view.dart';
import '../widgets/location_picker_map.dart';
import 'add_event_screen.dart' show HonoreeRow, DateField, kEventTextFieldKeys, formatEventDate;
import 'my_events_screen.dart' show eventStatusLabel, eventStatusColor;

/// الحقول التي يصنّفها الخادم دائماً حرِجة (events.service.js
/// CRITICAL_AMENDMENT_FIELDS) — تُستعمل هنا فقط لقرار عرض تحذير **قبل**
/// الحفظ. التصنيف الفعلي في الردّ (`amendment`) يبقى مصدر الحقيقة الوحيد؛
/// هذه القائمة لا تُعرض للمستخدم كحقيقة، هي فقط سبب لسؤاله قبل الإرسال.
const _fieldsThatMayTriggerReview = {
  'event_date',
  'event_end_date',
  'town',
  'location_name',
  'latitude',
  'longitude',
};

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
/// واحد على اسم النوع هنا. `PATCH /api/events/:id` بلا رفع ملفات إطلاقاً:
/// poster_url وaudio_url يُعرضان للقراءة فقط.
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

  final Map<String, TextEditingController> _controllers = {};
  late List<HonoreeRow> _honorees;

  late String _town;
  DateTime? _eventDate;
  DateTime? _eventEndDate;
  DateTime? _youthDate;
  double? _latitude;
  double? _longitude;

  bool _saving = false;
  String? _status;

  late Map<String, String> _originalText;
  late String _originalTown;
  String? _originalEventDate;
  String? _originalEventEndDate;
  String? _originalYouthDate;
  double? _originalLatitude;
  double? _originalLongitude;
  late List<Map<String, String>> _originalHonorees;

  @override
  void initState() {
    super.initState();
    _type = widget.event.occasionType;
    _status = widget.event.status;
    _loadFromEvent(widget.event);
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _townCoordsFuture ??= AppServices.of(context).api.townCoordinates();
    _amendmentsFuture ??= AppServices.of(context).api.eventAmendments(widget.event.id);
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

  /// فروق الحقول عن قيمها الأصلية فقط — مفتاح غائب يعني «بلا تغيير» عند
  /// الخادم، فلا يُرسَل إطلاقاً بدل قيمة مكرَّرة.
  Map<String, dynamic> _computeChanges() {
    final changes = <String, dynamic>{};

    for (final key in kEventTextFieldKeys) {
      final value = _controllerFor(key).text.trim();
      if (value != (_originalText[key] ?? '')) changes[key] = value;
    }

    if (_town != _originalTown) changes['town'] = _town;

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

    if (_honoreesChanged()) changes['honorees'] = _currentHonorees();

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

  Future<void> _save() async {
    final changes = _computeChanges();
    if (changes.isEmpty) return;

    // نلتقط الخدمة قبل أي await حتى لا نلمس context بعد فجوة غير متزامنة —
    // نفس نمط شاشة النشر.
    final api = AppServices.of(context).api;

    final touchesReview = changes.keys.any(_fieldsThatMayTriggerReview.contains);
    if (touchesReview) {
      final confirmed = await _confirmCriticalChange();
      if (!confirmed) return;
    }

    setState(() => _saving = true);

    try {
      final result = await api.updateEvent(widget.event.id, fields: changes);
      if (!mounted) return;

      setState(() {
        _status = result.status;
        _originalText = {
          for (final key in kEventTextFieldKeys) key: _controllerFor(key).text.trim(),
        };
        _originalTown = _town;
        _originalEventDate = _eventDate == null ? null : formatEventDate(_eventDate!);
        _originalEventEndDate = _eventEndDate == null ? null : formatEventDate(_eventEndDate!);
        _originalYouthDate = _youthDate == null ? null : formatEventDate(_youthDate!);
        _originalLatitude = _latitude;
        _originalLongitude = _longitude;
        _originalHonorees = _currentHonorees();
        _amendmentsFuture = api.eventAmendments(widget.event.id);
      });

      showMessage(context, composeEventUpdateMessage(result));
    } catch (error) {
      if (mounted) showMessage(context, '$error', isError: true);
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
          DropdownButtonFormField<String>(
            initialValue: _town,
            decoration: InputDecoration(
              labelText: '${type?.labelFor('town') ?? 'البلدة'} *',
            ),
            items: AppConfig.towns
                .map((town) => DropdownMenuItem(value: town, child: Text(town)))
                .toList(),
            onChanged: (value) {
              if (value == null) return;
              setState(() => _town = value);
            },
          ),
          const SizedBox(height: 12),
          FutureBuilder<Map<String, TownCoordinate>>(
            future: _townCoordsFuture,
            builder: (context, snapshot) {
              return LocationPickerMap(
                town: _town,
                townCoordinates: snapshot.data ?? const {},
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
          const SizedBox(height: 12),
          ..._textFieldWidget(type, 'dinner_time'),
          ..._textFieldWidget(type, 'host_phone', keyboardType: TextInputType.phone),
          if (type?.showsField('poster_url') ?? false)
            _ReadOnlyMediaTile(
              icon: Icons.image_outlined,
              label: type?.labelFor('poster_url') ?? 'بوستر الدعوة',
              value: widget.event.posterUrl,
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
          decoration: InputDecoration(labelText: required ? '$label *' : label),
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
  const _ReadOnlyMediaTile({required this.icon, required this.label, required this.value});

  final IconData icon;
  final String label;
  final String? value;

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 6),
      decoration: BoxDecoration(
        color: context.c.surface,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: context.c.line),
      ),
      child: ListTile(
        leading: Icon(icon, color: context.c.inkFaint),
        title: Text(label, style: const TextStyle(fontSize: 14.5)),
        subtitle: Text(
          value == null || value!.isEmpty ? 'لا يوجد' : 'غير قابل للتعديل من هذه الشاشة',
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: TextStyle(fontSize: 12, color: context.c.inkFaint),
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
