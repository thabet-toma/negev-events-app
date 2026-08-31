import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:image_picker/image_picker.dart';

import '../config.dart';
import '../main.dart';
import '../models/event.dart';
import '../theme.dart';
import '../widgets/async_view.dart';

/// تقديم مناسبة جديدة. تدخل قائمة المراجعة — الاعتماد من لوحة الإدارة.
class AddEventScreen extends StatefulWidget {
  const AddEventScreen({super.key});

  @override
  State<AddEventScreen> createState() => _AddEventScreenState();
}

class _AddEventScreenState extends State<AddEventScreen> {
  final _formKey = GlobalKey<FormState>();

  final _groomController = TextEditingController();
  final _clanController = TextEditingController();
  final _locationController = TextEditingController();
  final _phoneController = TextEditingController();
  final _dinnerController = TextEditingController(text: 'الساعة 8:00 مساءً');

  String _town = AppConfig.towns.first;
  DateTime? _eventDate;
  DateTime? _youthDate;

  XFile? _poster;
  PlatformFile? _audio;

  bool _submitting = false;
  List<Event> _conflicts = const [];
  bool _checkingCollision = false;

  @override
  void dispose() {
    _groomController.dispose();
    _clanController.dispose();
    _locationController.dispose();
    _phoneController.dispose();
    _dinnerController.dispose();
    super.dispose();
  }

  String _format(DateTime date) {
    final month = date.month.toString().padLeft(2, '0');
    final day = date.day.toString().padLeft(2, '0');
    return '${date.year}-$month-$day';
  }

  Future<void> _pickDate({required bool isYouthParty}) async {
    final now = DateTime.now();
    final picked = await showDatePicker(
      context: context,
      initialDate: (isYouthParty ? _youthDate : _eventDate) ?? now,
      firstDate: DateTime(now.year - 1),
      lastDate: DateTime(now.year + 3),
    );
    if (picked == null) return;

    setState(() {
      if (isYouthParty) {
        _youthDate = picked;
      } else {
        _eventDate = picked;
      }
    });

    if (!isYouthParty) await _checkCollision();
  }

  /// يحذّر من تعارض تاريخ في نفس البلدة قبل الإرسال — نفس سلوك الويب.
  Future<void> _checkCollision() async {
    if (_eventDate == null) return;

    setState(() => _checkingCollision = true);
    try {
      final conflicts = await AppServices.of(context).api.checkCollision(
            date: _format(_eventDate!),
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

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    if (_eventDate == null) {
      showMessage(context, 'اختر تاريخ المناسبة', isError: true);
      return;
    }

    setState(() => _submitting = true);
    // نلتقط الخدمة قبل أي await حتى لا نلمس context بعد فجوة غير متزامنة.
    final api = AppServices.of(context).api;

    try {
      final fields = <String, String>{
        'groom_name': _groomController.text.trim(),
        'family_clan': _clanController.text.trim(),
        'town': _town,
        'location_name': _locationController.text.trim(),
        'event_date': _format(_eventDate!),
        'dinner_time': _dinnerController.text.trim(),
        if (_youthDate != null) 'youth_party_date': _format(_youthDate!),
        if (_phoneController.text.trim().isNotEmpty)
          'host_phone': _phoneController.text.trim(),
      };

      http.MultipartFile? posterFile;
      if (_poster != null) {
        posterFile = http.MultipartFile.fromBytes(
          'poster',
          await _poster!.readAsBytes(),
          filename: _poster!.name,
        );
      }

      http.MultipartFile? audioFile;
      if (_audio != null) {
        audioFile = http.MultipartFile.fromBytes(
          'audio',
          await _audio!.readAsBytes(),
          filename: _audio!.name,
        );
      }

      final message = await api.submitEvent(
        fields: fields,
        poster: posterFile,
        audio: audioFile,
      );

      if (!mounted) return;
      showMessage(context, message);
      _reset();
    } catch (error) {
      if (mounted) showMessage(context, '$error', isError: true);
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  void _reset() {
    _formKey.currentState?.reset();
    _groomController.clear();
    _clanController.clear();
    _locationController.clear();
    _phoneController.clear();
    _dinnerController.text = 'الساعة 8:00 مساءً';
    setState(() {
      _eventDate = null;
      _youthDate = null;
      _poster = null;
      _audio = null;
      _conflicts = const [];
      _town = AppConfig.towns.first;
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('إعلان مناسبة')),
      body: Form(
        key: _formKey,
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 16, 16, 30),
          children: [
            const _Note(
              text:
                  'المناسبة تدخل قائمة المراجعة، ويتم نشرها بعد اعتماد الإدارة.',
            ),
            const SizedBox(height: 16),
            TextFormField(
              controller: _groomController,
              decoration: const InputDecoration(labelText: 'اسم العريس *'),
              validator: (value) => (value == null || value.trim().isEmpty)
                  ? 'اسم العريس مطلوب'
                  : null,
            ),
            const SizedBox(height: 12),
            TextFormField(
              controller: _clanController,
              decoration: const InputDecoration(labelText: 'العائلة / العشيرة'),
            ),
            const SizedBox(height: 12),
            DropdownButtonFormField<String>(
              initialValue: _town,
              decoration: const InputDecoration(labelText: 'البلدة *'),
              items: AppConfig.towns
                  .map((town) => DropdownMenuItem(value: town, child: Text(town)))
                  .toList(),
              onChanged: (value) {
                if (value == null) return;
                setState(() => _town = value);
                _checkCollision();
              },
            ),
            const SizedBox(height: 12),
            TextFormField(
              controller: _locationController,
              decoration: const InputDecoration(
                labelText: 'اسم المكان / القاعة *',
              ),
              validator: (value) => (value == null || value.trim().isEmpty)
                  ? 'المكان مطلوب'
                  : null,
            ),
            const SizedBox(height: 12),
            _DateField(
              label: 'تاريخ العرس *',
              value: _eventDate == null ? null : _format(_eventDate!),
              onTap: () => _pickDate(isYouthParty: false),
            ),
            if (_checkingCollision)
              const Padding(
                padding: EdgeInsets.only(top: 8),
                child: LinearProgressIndicator(minHeight: 2),
              ),
            if (_conflicts.isNotEmpty) _CollisionWarning(conflicts: _conflicts),
            const SizedBox(height: 12),
            _DateField(
              label: 'سهرة الشباب (اختياري)',
              value: _youthDate == null ? null : _format(_youthDate!),
              onTap: () => _pickDate(isYouthParty: true),
            ),
            const SizedBox(height: 12),
            TextFormField(
              controller: _dinnerController,
              decoration: const InputDecoration(labelText: 'موعد العشاء'),
            ),
            const SizedBox(height: 12),
            TextFormField(
              controller: _phoneController,
              keyboardType: TextInputType.phone,
              decoration: const InputDecoration(
                labelText: 'هاتف صاحب المناسبة (اختياري)',
              ),
            ),
            const SizedBox(height: 18),
            _FilePickTile(
              icon: Icons.image_outlined,
              label: 'بوستر الدعوة',
              value: _poster?.name,
              onPick: _pickPoster,
              onClear: () => setState(() => _poster = null),
            ),
            const SizedBox(height: 10),
            _FilePickTile(
              icon: Icons.music_note_outlined,
              label: 'شيلة الفرح',
              value: _audio?.name,
              onPick: _pickAudio,
              onClear: () => setState(() => _audio = null),
            ),
            const SizedBox(height: 24),
            ElevatedButton.icon(
              onPressed: _submitting ? null : _submit,
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
        ),
      ),
    );
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
        color: AppTheme.bgSurface,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppTheme.borderSubtle),
      ),
      child: Row(
        children: [
          const Icon(Icons.info_outline, size: 18, color: AppTheme.gold),
          const SizedBox(width: 9),
          Expanded(
            child: Text(
              text,
              style: const TextStyle(
                fontSize: 13,
                color: AppTheme.textSecondary,
                height: 1.5,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _DateField extends StatelessWidget {
  const _DateField({
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
            color: value == null ? AppTheme.textMuted : AppTheme.textPrimary,
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
        color: const Color(0xFF3B2A08),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppTheme.goldDark),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(Icons.warning_amber, size: 18, color: AppTheme.gold),
              const SizedBox(width: 8),
              Text(
                'تنبيه: ${conflicts.length} مناسبة في نفس التاريخ',
                style: const TextStyle(
                  color: AppTheme.textGold,
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
                    '• ${event.groomName} — ${event.town}',
                    style: const TextStyle(
                      fontSize: 12.5,
                      color: AppTheme.textSecondary,
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
        color: AppTheme.bgSurface,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppTheme.borderSubtle),
      ),
      child: ListTile(
        leading: Icon(icon, color: AppTheme.gold),
        title: Text(label, style: const TextStyle(fontSize: 14.5)),
        subtitle: Text(
          value ?? 'لم يُختر ملف',
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: const TextStyle(fontSize: 12, color: AppTheme.textMuted),
        ),
        trailing: value == null
            ? IconButton(
                icon: const Icon(Icons.upload_file, color: AppTheme.gold),
                onPressed: onPick,
                tooltip: 'اختيار',
              )
            : IconButton(
                icon: const Icon(Icons.close, color: AppTheme.textMuted),
                onPressed: onClear,
                tooltip: 'إزالة',
              ),
        onTap: value == null ? onPick : null,
      ),
    );
  }
}
