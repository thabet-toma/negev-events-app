import 'package:flutter/material.dart';

import '../api/negev_api.dart' show NegevApi;
import '../main.dart';
import '../models/nokoot.dart';
import '../theme.dart';
import '../widgets/async_view.dart';
import '../widgets/auth_action_button.dart';
import 'account_screen.dart';

/// دفتر النقوط — خاص بالمستخدم، والخادم يقصر كل استعلام على صاحبه.
class NokootScreen extends StatefulWidget {
  const NokootScreen({super.key});

  @override
  State<NokootScreen> createState() => _NokootScreenState();
}

class _NokootScreenState extends State<NokootScreen> {
  Future<NokootLedger>? _ledger;

  void _refresh() {
    setState(() => _ledger = AppServices.of(context).api.nokoot());
  }

  Future<void> _openAddSheet() async {
    final saved = await showAddNokootSheet(context);
    if (saved) _refresh();
  }

  Future<void> _delete(NokootRecord record) async {
    // نلتقط الخدمة قبل الحوار حتى لا نلمس context بعد فجوة غير متزامنة.
    final api = AppServices.of(context).api;

    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        backgroundColor: dialogContext.c.surfaceSunk,
        title: const Text('حذف القيد'),
        content: Text('هل تريد حذف قيد "${record.recipientName}"؟'),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(false),
            child: const Text('إلغاء'),
          ),
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(true),
            child: Text('حذف', style: TextStyle(color: dialogContext.c.danger)),
          ),
        ],
      ),
    );

    if (confirmed != true) return;

    try {
      await api.deleteNokoot(record.id);
      _refresh();
    } catch (error) {
      if (mounted) showMessage(context, '$error', isError: true);
    }
  }

  @override
  Widget build(BuildContext context) {
    final auth = AppServices.of(context).auth;

    return AnimatedBuilder(
      animation: auth,
      builder: (context, _) {
        if (!auth.isSignedIn) {
          return Scaffold(
            appBar: AppBar(
              title: const Text('دفتر النقوط'),
              actions: const [AuthActionButton()],
            ),
            body: const _SignInPrompt(),
          );
        }

        _ledger ??= AppServices.of(context).api.nokoot();

        return Scaffold(
          appBar: AppBar(
            title: const Text('دفتر النقوط'),
            actions: [
              IconButton(
                icon: const Icon(Icons.refresh),
                tooltip: 'تحديث',
                onPressed: _refresh,
              ),
              const AuthActionButton(),
            ],
          ),
          floatingActionButton: FloatingActionButton.extended(
            onPressed: _openAddSheet,
            backgroundColor: context.c.sky,
            foregroundColor: context.c.onSky,
            icon: const Icon(Icons.add),
            label: const Text('قيد جديد'),
          ),
          body: FutureBuilder<NokootLedger>(
            future: _ledger,
            builder: (context, snapshot) {
              return AsyncView<NokootLedger>(
                snapshot: snapshot,
                onRetry: _refresh,
                builder: (ledger) => ListView(
                  padding: const EdgeInsets.fromLTRB(16, 16, 16, 90),
                  children: [
                    _Totals(ledger: ledger),
                    const SizedBox(height: 18),
                    if (ledger.records.isEmpty)
                      Padding(
                        padding: const EdgeInsets.symmetric(vertical: 40),
                        child: Text(
                          'دفترك فارغ — أضف أول قيد نقوط',
                          textAlign: TextAlign.center,
                          style: TextStyle(color: context.c.inkFaint),
                        ),
                      )
                    else
                      ...ledger.records.map(
                        (record) => _RecordTile(
                          record: record,
                          onDelete: () => _delete(record),
                        ),
                      ),
                  ],
                ),
              );
            },
          ),
        );
      },
    );
  }
}

/// ورقة إضافة قيد نقوط — مستخرَجة من [NokootScreen] كي تفتحها «قائمتي» على
/// مناسبة بعينها («سجّل نقوطك») بنفس الورقة ونفس التحقّق، بلا نسخة ثانية.
///
/// تعيد `true` فقط حين حُفظ صفّ فعلاً؛ التحديث مسؤولية المستدعي، فلا تعرف هذه
/// الدالة أيّ شاشة استدعتها.
///
/// [recipient] و[date] و[town] تعبئة أوّلية فقط: البلدة تُتجاهَل إن لم تكن
/// ضمن قائمة المنتقي (فيبقى الافتراضي)، والتاريخ يبقى فارغاً إن لم يُمرَّر.
Future<bool> showAddNokootSheet(
  BuildContext context, {
  String? recipient,
  DateTime? date,
  String? town,
}) async {
  // نلتقط الخدمة قبل الورقة حتى لا نلمس context بعد فجوة غير متزامنة.
  final api = AppServices.of(context).api;
  final towns = AppServices.of(context).places.catalog.towns;

  final saved = await showModalBottomSheet<bool>(
    context: context,
    isScrollControlled: true,
    backgroundColor: context.c.surfaceSunk,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(22)),
    ),
    builder: (sheetContext) => _AddNokootSheet(
      api: api,
      towns: towns,
      recipient: recipient,
      date: date,
      town: town,
    ),
  );
  return saved == true;
}

/// جسم ورقة إضافة القيد — مكوّن يملك محرّراته بنفسه.
///
/// الملكية هنا ليست تنغيماً: `showModalBottomSheet` يعيد نتيجته لحظة طلب
/// الإغلاق لا لحظة اكتمال انسحاب الورقة، فمحرّر يُفصَل في المستدعي فور وصول
/// النتيجة يُقرَأ مُفصَلاً طوال انتقال الخروج (رمي في وضع التنقيح). `dispose`
/// هنا يقع مع تفكيك شجرة الورقة، أي بعد انتهاء الانتقال.
class _AddNokootSheet extends StatefulWidget {
  const _AddNokootSheet({
    required this.api,
    required this.towns,
    this.recipient,
    this.date,
    this.town,
  });

  final NegevApi api;
  final List<String> towns;
  final String? recipient;
  final DateTime? date;
  final String? town;

  @override
  State<_AddNokootSheet> createState() => _AddNokootSheetState();
}

class _AddNokootSheetState extends State<_AddNokootSheet> {
  late final TextEditingController _recipient =
      TextEditingController(text: widget.recipient ?? '');
  final TextEditingController _amount = TextEditingController();
  final TextEditingController _notes = TextEditingController();

  /// بلدة المناسبة حين تكون ضمن قائمة المنتقي، وإلا الافتراضية (أوّل القائمة).
  late String _town = widget.town != null && widget.towns.contains(widget.town)
      ? widget.town!
      : widget.towns.first;
  late DateTime? _date = widget.date;
  bool _saving = false;

  @override
  void dispose() {
    _recipient.dispose();
    _amount.dispose();
    _notes.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    final name = _recipient.text.trim();
    final amount = double.tryParse(_amount.text.trim());

    if (name.isEmpty || amount == null || _date == null) {
      showMessage(context, 'الاسم والمبلغ والتاريخ مطلوبة', isError: true);
      return;
    }

    setState(() => _saving = true);
    try {
      final day =
          '${_date!.year}-${_date!.month.toString().padLeft(2, '0')}-${_date!.day.toString().padLeft(2, '0')}';
      await widget.api.addNokoot(
        recipientName: name,
        amount: amount,
        eventDate: day,
        clanTown: _town,
        notes: _notes.text.trim(),
      );
      if (mounted) Navigator.of(context).pop(true);
    } catch (error) {
      if (mounted) showMessage(context, '$error', isError: true);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(
        left: 18,
        right: 18,
        top: 20,
        bottom: MediaQuery.of(context).viewInsets.bottom + 22,
      ),
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              'إضافة قيد نقوط',
              textAlign: TextAlign.center,
              style: TextStyle(
                fontSize: 18,
                fontWeight: FontWeight.bold,
                color: context.c.ink,
              ),
            ),
            const SizedBox(height: 16),
            TextField(
              controller: _recipient,
              decoration: const InputDecoration(labelText: 'اسم المستلم *'),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _amount,
              keyboardType:
                  const TextInputType.numberWithOptions(decimal: true),
              decoration: const InputDecoration(labelText: 'المبلغ (₪) *'),
            ),
            const SizedBox(height: 12),
            DropdownButtonFormField<String>(
              initialValue: _town,
              decoration: const InputDecoration(labelText: 'البلدة'),
              items: widget.towns
                  .map(
                    (item) => DropdownMenuItem(value: item, child: Text(item)),
                  )
                  .toList(),
              onChanged: (value) {
                if (value != null) setState(() => _town = value);
              },
            ),
            const SizedBox(height: 12),
            InkWell(
              onTap: () async {
                final now = DateTime.now();
                final picked = await showDatePicker(
                  context: context,
                  initialDate: _date ?? now,
                  firstDate: DateTime(now.year - 10),
                  lastDate: DateTime(now.year + 3),
                );
                if (picked != null) setState(() => _date = picked);
              },
              child: InputDecorator(
                decoration: const InputDecoration(
                  labelText: 'تاريخ المناسبة *',
                  suffixIcon: Icon(Icons.calendar_today, size: 18),
                ),
                child: Text(
                  _date == null
                      ? 'اختر التاريخ'
                      : '${_date!.year}-${_date!.month.toString().padLeft(2, '0')}-${_date!.day.toString().padLeft(2, '0')}',
                  style: TextStyle(
                    color: _date == null ? context.c.inkFaint : context.c.ink,
                  ),
                ),
              ),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _notes,
              maxLines: 2,
              decoration: const InputDecoration(labelText: 'ملاحظات'),
            ),
            const SizedBox(height: 20),
            ElevatedButton(
              onPressed: _saving ? null : _save,
              child: Text(_saving ? 'جارٍ الحفظ…' : 'حفظ القيد'),
            ),
          ],
        ),
      ),
    );
  }
}

class _Totals extends StatelessWidget {
  const _Totals({required this.ledger});

  final NokootLedger ledger;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: context.c.surface,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: context.c.line),
      ),
      child: Column(
        children: [
          Text(
            'إجمالي النقوط',
            style: TextStyle(color: context.c.inkFaint, fontSize: 13),
          ),
          const SizedBox(height: 6),
          Text(
            '${ledger.totalAmount.toStringAsFixed(0)} ₪',
            style: TextStyle(
              fontSize: 30,
              fontWeight: FontWeight.bold,
              color: context.c.sky,
              fontFeatures: const [FontFeature.tabularFigures()],
            ),
          ),
          const SizedBox(height: 14),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceEvenly,
            children: [
              _Stat(label: 'عدد القيود', value: '${ledger.count}'),
              Container(width: 1, height: 34, color: context.c.line),
              _Stat(
                label: 'المعدّل',
                value: '${ledger.averageNokoot.toStringAsFixed(0)} ₪',
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _Stat extends StatelessWidget {
  const _Stat({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Text(
          value,
          style: TextStyle(
            fontSize: 17,
            fontWeight: FontWeight.bold,
            color: context.c.ink,
            fontFeatures: const [FontFeature.tabularFigures()],
          ),
        ),
        const SizedBox(height: 3),
        Text(
          label,
          style: TextStyle(fontSize: 11.5, color: context.c.inkFaint),
        ),
      ],
    );
  }
}

class _RecordTile extends StatelessWidget {
  const _RecordTile({required this.record, required this.onDelete});

  final NokootRecord record;
  final VoidCallback onDelete;

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      decoration: BoxDecoration(
        color: context.c.surface,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: context.c.line),
      ),
      child: ListTile(
        title: Text(
          record.recipientName,
          style: TextStyle(
            fontWeight: FontWeight.bold,
            color: context.c.ink,
            fontSize: 15,
          ),
        ),
        subtitle: Padding(
          padding: const EdgeInsets.only(top: 4),
          child: Text(
            '${record.clanTown ?? 'أخرى'} • ${record.eventDate} • ${record.occasionType}',
            style: TextStyle(fontSize: 12.5, color: context.c.inkFaint),
          ),
        ),
        trailing: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              '${record.amount.toStringAsFixed(0)} ₪',
              style: TextStyle(
                fontSize: 16,
                fontWeight: FontWeight.bold,
                color: context.c.sky,
                fontFeatures: const [FontFeature.tabularFigures()],
              ),
            ),
            IconButton(
              icon: Icon(
                Icons.delete_outline,
                size: 20,
                color: context.c.inkFaint,
              ),
              onPressed: onDelete,
              tooltip: 'حذف',
            ),
          ],
        ),
      ),
    );
  }
}

class _SignInPrompt extends StatelessWidget {
  const _SignInPrompt();

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(30),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.lock_outline, size: 48, color: context.c.inkFaint),
            const SizedBox(height: 16),
            Text(
              'دفتر النقوط خاص بك وحدك',
              style: TextStyle(
                fontSize: 17,
                fontWeight: FontWeight.bold,
                color: context.c.ink,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              'سجّل الدخول للاطلاع على سجل نقوطك وإضافة قيود جديدة.',
              textAlign: TextAlign.center,
              style: TextStyle(color: context.c.inkSoft, height: 1.6),
            ),
            const SizedBox(height: 22),
            ElevatedButton.icon(
              onPressed: () => Navigator.of(context).push(
                MaterialPageRoute(builder: (_) => const SignInScreen()),
              ),
              icon: const Icon(Icons.login),
              label: const Text('تسجيل الدخول'),
            ),
          ],
        ),
      ),
    );
  }
}
