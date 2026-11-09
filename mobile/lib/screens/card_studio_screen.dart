import 'dart:typed_data';

import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:image_picker/image_picker.dart';

import '../api/negev_api.dart';
import '../main.dart';
import '../theme.dart';
import '../widgets/async_view.dart';

/// تسمية عربية لنبرة قالب — `solemn` عزاء هادئ و`festive` فرح، والقيمة
/// غير المعروفة تُقرأ فرحاً كافتراض الخادم نفسه. عامة كي يقرأها الاختبار
/// وتُعرض في بطاقة القالب بلا نسخة ثانية من نفس الجملة.
String cardToneLabel(String tone) => tone == 'solemn' ? 'هادئة للعزاء' : 'فرح';

/// لون من قيمة hexadecimal يرسلها الخادم (`#rrggbb` أو `#rgb`، بلا `#` أيضاً).
/// لوحة القوالب نصوص من الخادم لا من المستخدم، وقيمة غريبة تُعرض شفافة بدل
/// أن تُسقط الشاشة — لا `int.parse` عارية على مدخل خارجي.
Color cardColorFromHex(String? value) {
  final text = (value ?? '').replaceAll('#', '').trim();
  final full = text.length == 3 ? text.split('').map((part) => '$part$part').join() : text;
  final parsed = RegExp(r'^[0-9a-fA-F]{6}$').hasMatch(full) ? int.parse(full, radix: 16) : null;
  if (parsed == null) return Colors.transparent;
  return Color(0xFF000000 | parsed);
}

/// ستوديو بطاقة الدعوة في التطبيق (#181، فوق مسارات #180).
///
/// نفس ستوديو الويب حرفياً في عقده: القوالب من `GET /api/card-templates`،
/// والمعاينة `POST …/cards/preview` (PNG مصغّر يُعرض من الذاكرة لا من رابط)،
/// والحفظ `POST …/cards`، وقائمة البطاقات `GET …/cards` مع تعيين أساسية وحذف.
/// **كل نداء عبر `NegevApi`** — لا `http` في هذه الشاشة إلا لبناء ملف
/// `MultipartFile` من الصورة المختارة، كما تفعل شاشة النشر.
///
/// **النبرة بوابة عرض لا زينة:** [tone] من نوع المناسبة (`occasion_types.tone`)،
/// وقوالبه المعروضة هي `catalog.templatesForTone(tone)` وحدها — مناسبة العزاء
/// لا ترى قالب فرح، وغيرها لا يرى قالبي العزاء. الخادم يفرضها في كل كتابة
/// أيضاً، فترشيح العميل ليس الحارس الأخير بل ما يجعل الاختيار ممكناً فقط.
class CardStudioScreen extends StatefulWidget {
  const CardStudioScreen({
    super.key,
    required this.eventId,
    required this.tone,
    this.eventTitle,
  });

  final int eventId;

  /// نبرة نوع المناسبة — `solemn` أو `festive` (وما عداها يُقرأ `festive`).
  final String tone;

  /// عنوان المناسبة في الترويسة الفرعية — عرض فقط، ولا يشارك في أي نداء.
  final String? eventTitle;

  @override
  State<CardStudioScreen> createState() => _CardStudioScreenState();
}

class _CardStudioScreenState extends State<CardStudioScreen> {
  bool _started = false;

  bool _loadingCatalog = true;
  String? _catalogError;
  CardStudioCatalog _catalog = const CardStudioCatalog();

  /// القوالب المعروضة — المترشِّحة بالنبرة، لا الكتالوج كاملاً.
  List<CardTemplate> _templates = const [];
  List<CardSize> _sizes = const [];

  CardTemplate? _template;
  CardSize? _size;
  String? _fontKey;
  String? _color;

  /// `event` (ملصق المناسبة) أو `upload` (ملف اختاره المستخدم) أو `none`.
  String _photoSource = 'event';
  XFile? _photo;

  Uint8List? _preview;
  bool _previewing = false;
  String? _previewError;

  /// فشل فتح معرض الصور (صلاحية/منصّة) — نصّ عربي داخل الشاشة، لا استثناء
  /// async يفلت من معالج الضغط.
  String? _photoError;

  bool _saving = false;

  /// نتيجة آخر عملية (حفظ/تعيين أساسية/حذف) بنصّ الخادم العربي كما وصل.
  String? _result;
  bool _resultIsError = false;

  /// آخر بطاقة حُفظت — هي ما تعود به الشاشة (زرّ الرجوع) للمستدعي.
  EventCardItem? _savedCard;

  Future<List<EventCardItem>>? _cardsFuture;

  String get _tone => widget.tone == 'solemn' ? 'solemn' : 'festive';

  NegevApi get _api => AppServices.of(context).api;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_started) return;
    _started = true;
    _cardsFuture = _api.eventCards(widget.eventId);
    _loadCatalog();
  }

  Future<void> _loadCatalog() async {
    setState(() {
      _loadingCatalog = true;
      _catalogError = null;
    });
    try {
      final catalog = await _api.cardStudioCatalog(tone: _tone);
      if (!mounted) return;
      setState(() {
        _catalog = catalog;
        // `?tone=` على الخادم ممرّ شبكة لا حارس عرض: الترشيح هنا هو ما يضمن
        // ألّا يظهر قالب النبرة الأخرى ولو وصل الكتالوج كاملاً.
        _templates = catalog.templatesForTone(_tone);
        _sizes = catalog.sizes;
        _size ??= _sizes.isEmpty ? null : _sizes.first;
        _selectTemplate(_templates.isEmpty ? null : _templates.first);
        _loadingCatalog = false;
      });
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _catalogError = '$error';
        _loadingCatalog = false;
      });
    }
  }

  /// يبدّل القالب المختار ويهيّئ خطّه ولونه من إعداداته — لا خطّ من قالب آخر.
  /// لا `setState` في الداخل: تُنادى من داخل `setState` وبعده سواء.
  void _selectTemplate(CardTemplate? template) {
    _template = template;
    _invalidatePreview();
    if (template == null) {
      _fontKey = null;
      _color = null;
      return;
    }
    _fontKey = template.fonts.isNotEmpty ? template.fonts.first : template.defaultFont;
    _color = template.colors.isEmpty ? null : template.colors.first.value;
  }

  /// أي تغيير في القالب/المقاس/الخط/اللون/الصورة يُبطل المعاينة القديمة —
  /// إبقاء صورة القالب السابق تحت سطر المقاس الجديد يجعلها تُقرأ كأنها صورة
  /// الاختيار الحالي. المستخدم يضغط «معاينة» من جديد فيُرى الاختيار الفعلي.
  void _invalidatePreview() {
    _preview = null;
    _previewError = null;
  }

  void _reloadCards() {
    // جسم كتلة لا سهم: `setState(() => _cardsFuture = …)` يعيد `Future` من
    // الـcallback، و`setState` يرفض ذلك («callback argument returned a Future»).
    setState(() {
      _cardsFuture = _api.eventCards(widget.eventId);
    });
  }

  Future<void> _pickPhoto() async {
    try {
      final picked = await ImagePicker().pickImage(
        source: ImageSource.gallery,
        imageQuality: 85,
      );
      if (!mounted) return;
      setState(() {
        _photoError = null;
        _photo = picked;
        // تراجع المستخدم عن الاختيار لا يترك مصدراً بلا ملف: الخادم يرفض
        // `upload` بلا صورة برسالة «ارفع الصورة المختارة أولاً»، فلا معنى
        // لعرض اختيار سيفشل حتماً.
        _photoSource = picked == null ? 'event' : 'upload';
        _invalidatePreview();
      });
    } catch (_) {
      // إذن معرض مرفوض أو فشل قناة المنصّة: رسالة عربية داخل الشاشة بدل
      // استثناء غير معالَج (كان يخرج من `onChanged` غير المنتظر).
      if (!mounted) return;
      setState(() {
        _photoError = 'تعذّر فتح معرض الصور — تحقّق من إذن الوصول إلى الصور وحاول مرة أخرى';
      });
    }
  }

  Future<void> _changePhotoSource(String? value) async {
    if (value == null) return;
    if (value == 'upload') {
      await _pickPhoto();
      return;
    }
    setState(() {
      _photoSource = value;
      _photo = null;
      _photoError = null;
      _invalidatePreview();
    });
  }

  Future<http.MultipartFile?> _photoFile() async {
    final photo = _photo;
    if (_photoSource != 'upload' || photo == null) return null;
    return http.MultipartFile.fromBytes(
      'photo',
      await photo.readAsBytes(),
      filename: photo.name,
    );
  }

  Future<void> _runPreview() async {
    final template = _template;
    final size = _size;
    final color = _color;
    if (template == null || size == null || color == null) {
      setState(() {
        _preview = null;
        _previewError = 'اختر القالب والمقاس واللون أولاً';
      });
      return;
    }

    setState(() {
      _previewing = true;
      _previewError = null;
    });
    try {
      final bytes = await _api.previewEventCard(
        widget.eventId,
        templateKey: template.key,
        size: size.key,
        fontKey: _fontKey ?? template.defaultFont,
        color: color,
        photoSource: _photoSource,
        photo: await _photoFile(),
      );
      if (!mounted) return;
      setState(() {
        _preview = bytes;
        _previewError = null;
      });
    } catch (error) {
      if (!mounted) return;
      // رسالة الخادم العربية كما وصلت (400 قالب/نبرة/لون، 429 «حاول بعد
      // قليل») أو رسالة الاتصال من `ApiClient` — تُعرض داخل الشاشة، بلا رمي
      // خارج معالج الضغط ولا شاشة حمراء.
      setState(() {
        _preview = null;
        _previewError = '$error';
      });
    } finally {
      if (mounted) setState(() => _previewing = false);
    }
  }

  Future<void> _save() async {
    final template = _template;
    final size = _size;
    final color = _color;
    if (template == null || size == null || color == null) {
      setState(() {
        _result = 'اختر القالب والمقاس واللون أولاً';
        _resultIsError = true;
      });
      return;
    }

    setState(() {
      _saving = true;
      _result = null;
      _resultIsError = false;
    });
    try {
      final result = await _api.saveEventCard(
        widget.eventId,
        templateKey: template.key,
        size: size.key,
        fontKey: _fontKey ?? template.defaultFont,
        color: color,
        photoSource: _photoSource,
        photo: await _photoFile(),
      );
      if (!mounted) return;
      setState(() {
        _savedCard = result.card;
        _result = result.message;
        _resultIsError = false;
      });
      _reloadCards();
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _result = '$error';
        _resultIsError = true;
      });
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<void> _makePrimary(EventCardItem card) async {
    try {
      final result = await _api.setPrimaryEventCard(widget.eventId, card.id);
      if (!mounted) return;
      setState(() {
        _result = result.message;
        _resultIsError = false;
      });
      _reloadCards();
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _result = '$error';
        _resultIsError = true;
      });
    }
  }

  Future<void> _delete(EventCardItem card) async {
    try {
      final message = await _api.deleteEventCard(widget.eventId, card.id);
      if (!mounted) return;
      setState(() {
        _result = message;
        _resultIsError = false;
      });
      _reloadCards();
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _result = '$error';
        _resultIsError = true;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('ستوديو بطاقة الدعوة'),
        // زرّ الرجوع يعيد آخر بطاقة حُفظت إلى المستدعي — نتيجةُ الجلسة كما
        // يعيدها الستوديو، لا فراغاً بعد حفظ ناجح.
        leading: BackButton(
          onPressed: () => Navigator.of(context).pop(_savedCard),
        ),
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(18, 16, 18, 28),
        children: [
          if (widget.eventTitle != null && widget.eventTitle!.isNotEmpty)
            Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: Text(
                widget.eventTitle!,
                style: TextStyle(
                  fontSize: 15,
                  fontWeight: FontWeight.bold,
                  color: context.c.ink,
                ),
              ),
            ),
          ..._buildBody(),
        ],
      ),
    );
  }

  List<Widget> _buildBody() {
    if (_loadingCatalog) {
      return const [
        Padding(
          padding: EdgeInsets.symmetric(vertical: 60),
          child: Center(child: CircularProgressIndicator()),
        ),
      ];
    }

    final error = _catalogError;
    if (error != null) {
      return [
        ErrorView(message: error, onRetry: _loadCatalog),
      ];
    }

    if (_templates.isEmpty) {
      return [
        EmptyView(
          message: _tone == 'solemn'
              ? 'لا قوالب عزاء متاحة الآن — حاول بعد قليل'
              : 'لا قوالب متاحة الآن — حاول بعد قليل',
        ),
      ];
    }

    return [
      _sectionLabel('القالب'),
      _templatePicker(),
      const SizedBox(height: 18),
      _sectionLabel('المقاس'),
      _sizePicker(),
      const SizedBox(height: 18),
      _sectionLabel('الخط'),
      _fontPicker(),
      const SizedBox(height: 18),
      _sectionLabel('اللون'),
      _colorPicker(),
      const SizedBox(height: 18),
      _sectionLabel('الصورة'),
      _photoPicker(),
      const SizedBox(height: 20),
      _previewBox(),
      const SizedBox(height: 10),
      if (_previewError != null) _errorNote(_previewError!),
      const SizedBox(height: 6),
      _actions(),
      if (_result != null) ...[
        const SizedBox(height: 10),
        _resultNote(_result!),
      ],
      const SizedBox(height: 26),
      _sectionLabel('بطاقاتي المحفوظة'),
      _savedCards(),
    ];
  }

  Widget _sectionLabel(String text) => Padding(
        padding: const EdgeInsets.only(bottom: 8),
        child: Text(
          text,
          style: TextStyle(fontSize: 13, color: context.c.inkSoft),
        ),
      );

  Widget _templatePicker() {
    return Wrap(
      spacing: 8,
      runSpacing: 8,
      children: [
        for (final template in _templates) _templateTile(template),
      ],
    );
  }

  Widget _templateTile(CardTemplate template) {
    final selected = _template?.key == template.key;
    return InkWell(
      key: Key('card_studio_template_${template.key}'),
      onTap: () => setState(() => _selectTemplate(template)),
      borderRadius: BorderRadius.circular(14),
      child: Container(
        width: 152,
        padding: const EdgeInsets.all(10),
        decoration: BoxDecoration(
          color: selected ? context.c.skyWash : context.c.surface,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(
            color: selected ? context.c.sky : context.c.line,
            width: selected ? 1.8 : 1,
          ),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Container(
                  width: 14,
                  height: 14,
                  decoration: BoxDecoration(
                    color: cardColorFromHex(
                      template.colors.isEmpty ? null : template.colors.first.value,
                    ),
                    shape: BoxShape.circle,
                    border: Border.all(color: context.c.line),
                  ),
                ),
                const SizedBox(width: 6),
                Expanded(
                  child: Text(
                    template.name,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      fontSize: 13.5,
                      fontWeight: FontWeight.bold,
                      color: context.c.ink,
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 4),
            Text(
              cardToneLabel(template.tone),
              style: TextStyle(fontSize: 11, color: context.c.inkFaint),
            ),
            if (template.tagline.isNotEmpty)
              Padding(
                padding: const EdgeInsets.only(top: 2),
                child: Text(
                  template.tagline,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(fontSize: 11, color: context.c.inkSoft),
                ),
              ),
          ],
        ),
      ),
    );
  }

  Widget _sizePicker() {
    return Wrap(
      spacing: 8,
      runSpacing: 8,
      children: [
        for (final size in _sizes)
          ChoiceChip(
            key: Key('card_studio_size_${size.key}'),
            label: Text(
              size.width > 0 && size.height > 0
                  ? '${size.name} ${size.width}×${size.height}'
                  : size.name,
            ),
            selected: _size?.key == size.key,
            onSelected: (_) => setState(() {
              _size = size;
              _invalidatePreview();
            }),
          ),
      ],
    );
  }

  Widget _fontPicker() {
    final template = _template;
    final fontKeys = template?.fonts ?? const <String>[];
    if (fontKeys.isEmpty) {
      return Text(
        'لا خطوط متاحة لهذا القالب',
        style: TextStyle(fontSize: 12.5, color: context.c.inkFaint),
      );
    }
    return Wrap(
      spacing: 8,
      runSpacing: 8,
      children: [
        for (final key in fontKeys)
          ChoiceChip(
            key: Key('card_studio_font_$key'),
            label: Text(_catalog.fontByKey(key)?.name ?? key),
            selected: _fontKey == key,
            onSelected: (_) => setState(() {
              _fontKey = key;
              _invalidatePreview();
            }),
          ),
      ],
    );
  }

  Widget _colorPicker() {
    final colors = _template?.colors ?? const <CardTemplateColor>[];
    if (colors.isEmpty) {
      return Text(
        'لا ألوان متاحة لهذا القالب',
        style: TextStyle(fontSize: 12.5, color: context.c.inkFaint),
      );
    }
    return Wrap(
      spacing: 8,
      runSpacing: 8,
      children: [
        for (final color in colors)
          ChoiceChip(
            key: Key('card_studio_color_${color.value}'),
            avatar: CircleAvatar(
              backgroundColor: cardColorFromHex(color.value),
              radius: 9,
            ),
            label: Text(color.name.isEmpty ? color.value : color.name),
            selected: _color == color.value,
            onSelected: (_) => setState(() {
              _color = color.value;
              _invalidatePreview();
            }),
          ),
      ],
    );
  }

  Widget _photoPicker() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        InputDecorator(
          decoration: const InputDecoration(labelText: 'مصدر الصورة'),
          child: DropdownButtonHideUnderline(
            child: DropdownButton<String>(
              key: const Key('card_studio_photo_source'),
              value: _photoSource,
              isExpanded: true,
              items: const [
                DropdownMenuItem(value: 'event', child: Text('ملصق المناسبة')),
                DropdownMenuItem(value: 'upload', child: Text('رفع صورة جديدة')),
                DropdownMenuItem(value: 'none', child: Text('بلا صورة')),
              ],
              onChanged: _changePhotoSource,
            ),
          ),
        ),
        if (_photo != null)
          Padding(
            padding: const EdgeInsets.only(top: 6),
            child: Text(
              'الصورة المختارة: ${_photo!.name}',
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(fontSize: 12, color: context.c.inkSoft),
            ),
          ),
        if (_photoError != null)
          Padding(
            padding: const EdgeInsets.only(top: 6),
            child: Text(
              _photoError!,
              key: const Key('card_studio_photo_error'),
              style: TextStyle(fontSize: 12, color: context.c.danger),
            ),
          ),
      ],
    );
  }

  Widget _previewBox() {
    final caption = _size == null
        ? null
        : '${_size!.name} — ${_size!.width}×${_size!.height}';
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Container(
          padding: const EdgeInsets.all(10),
          decoration: BoxDecoration(
            color: context.c.surfaceSunk,
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: context.c.line),
          ),
          child: _previewing
              ? const SizedBox(
                  height: 180,
                  child: Center(child: CircularProgressIndicator()),
                )
              : _preview == null
                  ? Padding(
                      padding: const EdgeInsets.symmetric(vertical: 26, horizontal: 12),
                      child: Text(
                        'اختر القالب والمقاس، ثم اضغط «معاينة» لترى البطاقة قبل حفظها',
                        textAlign: TextAlign.center,
                        style: TextStyle(fontSize: 12.5, color: context.c.inkFaint),
                      ),
                    )
                  : SizedBox(
                      height: 360,
                      child: Center(
                        // نسبة المقاس من الكتالوج نفسه (`preview`) — المعاينة
                        // تُعرض بشكلها الحقيقي: ستوري طويل، مربّع مربّع.
                        child: AspectRatio(
                          aspectRatio: _size?.aspectRatio ?? 0.75,
                          child: Image.memory(
                            _preview!,
                            key: const Key('card_studio_preview_image'),
                            fit: BoxFit.contain,
                            // بايتات غريبة من الخادم لا تُسقط الشاشة — رسالة
                            // عربية مكان الصورة، كأي فشل معاينة آخر.
                            errorBuilder: (context, _, _) => Center(
                              child: Text(
                                'تعذّر عرض صورة المعاينة — حاول مرة أخرى',
                                style: TextStyle(fontSize: 12.5, color: context.c.danger),
                              ),
                            ),
                          ),
                        ),
                      ),
                    ),
        ),
        if (caption != null)
          Padding(
            padding: const EdgeInsets.only(top: 6),
            child: Text(
              caption,
              textAlign: TextAlign.center,
              style: TextStyle(fontSize: 11.5, color: context.c.inkFaint),
            ),
          ),
      ],
    );
  }

  Widget _actions() {
    return Row(
      children: [
        Expanded(
          child: ElevatedButton.icon(
            key: const Key('card_studio_preview_button'),
            onPressed: (_previewing || _saving) ? null : _runPreview,
            icon: const Icon(Icons.image_outlined, size: 18),
            label: Text(_previewing ? 'جارٍ الرسم…' : 'معاينة'),
          ),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: ElevatedButton.icon(
            key: const Key('card_studio_save_button'),
            onPressed: (_saving || _previewing) ? null : _save,
            icon: const Icon(Icons.save_outlined, size: 18),
            label: Text(_saving ? 'جارٍ الحفظ…' : 'حفظ البطاقة'),
          ),
        ),
      ],
    );
  }

  Widget _errorNote(String message) {
    return Container(
      key: const Key('card_studio_preview_error'),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: context.c.dangerWash,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: context.c.danger),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(Icons.error_outline, size: 18, color: context.c.danger),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              message,
              style: TextStyle(fontSize: 12.5, color: context.c.danger, height: 1.5),
            ),
          ),
        ],
      ),
    );
  }

  Widget _resultNote(String message) {
    final color = _resultIsError ? context.c.danger : context.c.success;
    final wash = _resultIsError ? context.c.dangerWash : context.c.successWash;
    return Container(
      key: const Key('card_studio_result'),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: wash,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: color),
      ),
      child: Text(
        message,
        style: TextStyle(fontSize: 12.5, color: color, height: 1.5),
      ),
    );
  }

  Widget _savedCards() {
    return FutureBuilder<List<EventCardItem>>(
      future: _cardsFuture,
      builder: (context, snapshot) {
        if (snapshot.connectionState == ConnectionState.waiting) {
          return const Padding(
            padding: EdgeInsets.symmetric(vertical: 18),
            child: Center(child: CircularProgressIndicator()),
          );
        }
        if (snapshot.hasError) {
          // غير المالك يردّ الخادم عليه 404 برسالته العربية، فتُعرض كما هي
          // بلا انهيار ولا استنتاج ملكية في العميل.
          return Text(
            '${snapshot.error}',
            key: const Key('card_studio_cards_error'),
            style: TextStyle(fontSize: 12.5, color: context.c.danger),
          );
        }
        final cards = snapshot.data ?? const <EventCardItem>[];
        if (cards.isEmpty) {
          return Text(
            'لا بطاقات محفوظة لهذه المناسبة بعد',
            key: const Key('card_studio_cards_empty'),
            style: TextStyle(fontSize: 12.5, color: context.c.inkFaint),
          );
        }
        return Column(
          key: const Key('card_studio_cards_list'),
          children: [for (final card in cards) _cardRow(card)],
        );
      },
    );
  }

  Widget _cardRow(EventCardItem card) {
    final templateName = _catalog.templateByKey(card.templateKey)?.name ?? card.templateKey;
    final sizeName = _catalog.sizeByKey(card.size)?.name ?? card.size;
    final label = [templateName, sizeName].where((part) => part.isNotEmpty).join(' — ');

    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: context.c.surface,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: context.c.line),
      ),
      child: Row(
        children: [
          ClipRRect(
            borderRadius: BorderRadius.circular(10),
            child: SizedBox(
              width: 54,
              height: 72,
              child: card.imageUrl.isEmpty
                  ? Icon(Icons.image_not_supported_outlined, color: context.c.inkFaint)
                  : CachedNetworkImage(
                      imageUrl: card.imageUrl,
                      fit: BoxFit.cover,
                      placeholder: (_, _) => Container(color: context.c.surfaceSunk),
                      errorWidget: (_, _, _) => Container(
                        color: context.c.surfaceSunk,
                        child: Icon(
                          Icons.image_not_supported_outlined,
                          size: 18,
                          color: context.c.inkFaint,
                        ),
                      ),
                    ),
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  label.isEmpty ? 'بطاقة محفوظة' : label,
                  style: TextStyle(
                    fontSize: 13.5,
                    fontWeight: FontWeight.bold,
                    color: context.c.ink,
                  ),
                ),
                const SizedBox(height: 3),
                Text(
                  card.isPrimary ? 'البطاقة الأساسية للمناسبة' : 'بطاقة محفوظة',
                  style: TextStyle(
                    fontSize: 11.5,
                    color: card.isPrimary ? context.c.success : context.c.inkFaint,
                  ),
                ),
              ],
            ),
          ),
          if (!card.isPrimary)
            TextButton(
              key: Key('card_studio_make_primary_${card.id}'),
              onPressed: () => _makePrimary(card),
              child: const Text('اجعلها أساسية'),
            ),
          IconButton(
            key: Key('card_studio_delete_${card.id}'),
            tooltip: 'حذف',
            icon: Icon(Icons.delete_outline, color: context.c.danger),
            onPressed: () => _delete(card),
          ),
        ],
      ),
    );
  }
}
