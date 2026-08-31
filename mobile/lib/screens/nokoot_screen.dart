import 'package:flutter/material.dart';

import '../config.dart';
import '../main.dart';
import '../models/nokoot.dart';
import '../theme.dart';
import '../widgets/async_view.dart';
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
    final recipientController = TextEditingController();
    final amountController = TextEditingController();
    final notesController = TextEditingController();
    String town = AppConfig.towns.first;
    DateTime? date;
    var saving = false;

    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: AppTheme.bgSecondary,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(22)),
      ),
      builder: (sheetContext) => StatefulBuilder(
        builder: (sheetContext, setSheetState) => Padding(
          padding: EdgeInsets.only(
            left: 18,
            right: 18,
            top: 20,
            bottom: MediaQuery.of(sheetContext).viewInsets.bottom + 22,
          ),
          child: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const Text(
                  'إضافة قيد نقوط',
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.bold,
                    color: AppTheme.textGold,
                  ),
                ),
                const SizedBox(height: 16),
                TextField(
                  controller: recipientController,
                  decoration: const InputDecoration(labelText: 'اسم المستلم *'),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: amountController,
                  keyboardType:
                      const TextInputType.numberWithOptions(decimal: true),
                  decoration: const InputDecoration(labelText: 'المبلغ (₪) *'),
                ),
                const SizedBox(height: 12),
                DropdownButtonFormField<String>(
                  initialValue: town,
                  decoration: const InputDecoration(labelText: 'البلدة'),
                  items: AppConfig.towns
                      .map((item) =>
                          DropdownMenuItem(value: item, child: Text(item)))
                      .toList(),
                  onChanged: (value) {
                    if (value != null) setSheetState(() => town = value);
                  },
                ),
                const SizedBox(height: 12),
                InkWell(
                  onTap: () async {
                    final now = DateTime.now();
                    final picked = await showDatePicker(
                      context: sheetContext,
                      initialDate: date ?? now,
                      firstDate: DateTime(now.year - 10),
                      lastDate: DateTime(now.year + 3),
                    );
                    if (picked != null) setSheetState(() => date = picked);
                  },
                  child: InputDecorator(
                    decoration: const InputDecoration(
                      labelText: 'تاريخ المناسبة *',
                      suffixIcon: Icon(Icons.calendar_today, size: 18),
                    ),
                    child: Text(
                      date == null
                          ? 'اختر التاريخ'
                          : '${date!.year}-${date!.month.toString().padLeft(2, '0')}-${date!.day.toString().padLeft(2, '0')}',
                      style: TextStyle(
                        color: date == null
                            ? AppTheme.textMuted
                            : AppTheme.textPrimary,
                      ),
                    ),
                  ),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: notesController,
                  maxLines: 2,
                  decoration: const InputDecoration(labelText: 'ملاحظات'),
                ),
                const SizedBox(height: 20),
                ElevatedButton(
                  onPressed: saving
                      ? null
                      : () async {
                          final recipient = recipientController.text.trim();
                          final amount =
                              double.tryParse(amountController.text.trim());

                          if (recipient.isEmpty ||
                              amount == null ||
                              date == null) {
                            showMessage(
                              sheetContext,
                              'الاسم والمبلغ والتاريخ مطلوبة',
                              isError: true,
                            );
                            return;
                          }

                          setSheetState(() => saving = true);
                          try {
                            final day =
                                '${date!.year}-${date!.month.toString().padLeft(2, '0')}-${date!.day.toString().padLeft(2, '0')}';
                            await AppServices.of(context).api.addNokoot(
                                  recipientName: recipient,
                                  amount: amount,
                                  eventDate: day,
                                  clanTown: town,
                                  notes: notesController.text.trim(),
                                );
                            if (sheetContext.mounted) {
                              Navigator.of(sheetContext).pop();
                            }
                            _refresh();
                          } catch (error) {
                            if (sheetContext.mounted) {
                              showMessage(sheetContext, '$error', isError: true);
                            }
                          } finally {
                            setSheetState(() => saving = false);
                          }
                        },
                  child: Text(saving ? 'جارٍ الحفظ…' : 'حفظ القيد'),
                ),
              ],
            ),
          ),
        ),
      ),
    );

    recipientController.dispose();
    amountController.dispose();
    notesController.dispose();
  }

  Future<void> _delete(NokootRecord record) async {
    // نلتقط الخدمة قبل الحوار حتى لا نلمس context بعد فجوة غير متزامنة.
    final api = AppServices.of(context).api;

    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        backgroundColor: AppTheme.bgSecondary,
        title: const Text('حذف القيد'),
        content: Text('هل تريد حذف قيد "${record.recipientName}"؟'),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(false),
            child: const Text('إلغاء'),
          ),
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(true),
            child: const Text('حذف', style: TextStyle(color: Colors.redAccent)),
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
            appBar: AppBar(title: const Text('دفتر النقوط')),
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
            ],
          ),
          floatingActionButton: FloatingActionButton.extended(
            onPressed: _openAddSheet,
            backgroundColor: AppTheme.gold,
            foregroundColor: AppTheme.bgPrimary,
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
                      const Padding(
                        padding: EdgeInsets.symmetric(vertical: 40),
                        child: Text(
                          'دفترك فارغ — أضف أول قيد نقوط',
                          textAlign: TextAlign.center,
                          style: TextStyle(color: AppTheme.textMuted),
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

class _Totals extends StatelessWidget {
  const _Totals({required this.ledger});

  final NokootLedger ledger;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: AppTheme.bgSurface,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: AppTheme.borderSubtle),
      ),
      child: Column(
        children: [
          const Text(
            'إجمالي النقوط',
            style: TextStyle(color: AppTheme.textMuted, fontSize: 13),
          ),
          const SizedBox(height: 6),
          Text(
            '${ledger.totalAmount.toStringAsFixed(0)} ₪',
            style: const TextStyle(
              fontSize: 30,
              fontWeight: FontWeight.bold,
              color: AppTheme.gold,
            ),
          ),
          const SizedBox(height: 14),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceEvenly,
            children: [
              _Stat(label: 'عدد القيود', value: '${ledger.count}'),
              Container(width: 1, height: 34, color: AppTheme.borderSubtle),
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
          style: const TextStyle(
            fontSize: 17,
            fontWeight: FontWeight.bold,
            color: AppTheme.textPrimary,
          ),
        ),
        const SizedBox(height: 3),
        Text(
          label,
          style: const TextStyle(fontSize: 11.5, color: AppTheme.textMuted),
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
        color: AppTheme.bgCard,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppTheme.borderSubtle),
      ),
      child: ListTile(
        title: Text(
          record.recipientName,
          style: const TextStyle(
            fontWeight: FontWeight.bold,
            color: AppTheme.textPrimary,
            fontSize: 15,
          ),
        ),
        subtitle: Padding(
          padding: const EdgeInsets.only(top: 4),
          child: Text(
            '${record.clanTown ?? 'أخرى'} • ${record.eventDate} • ${record.occasionType}',
            style: const TextStyle(fontSize: 12.5, color: AppTheme.textMuted),
          ),
        ),
        trailing: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              '${record.amount.toStringAsFixed(0)} ₪',
              style: const TextStyle(
                fontSize: 16,
                fontWeight: FontWeight.bold,
                color: AppTheme.gold,
              ),
            ),
            IconButton(
              icon: const Icon(
                Icons.delete_outline,
                size: 20,
                color: AppTheme.textMuted,
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
            const Icon(Icons.lock_outline, size: 48, color: AppTheme.textMuted),
            const SizedBox(height: 16),
            const Text(
              'دفتر النقوط خاص بك وحدك',
              style: TextStyle(
                fontSize: 17,
                fontWeight: FontWeight.bold,
                color: AppTheme.textGold,
              ),
            ),
            const SizedBox(height: 8),
            const Text(
              'سجّل الدخول للاطلاع على سجل نقوطك وإضافة قيود جديدة.',
              textAlign: TextAlign.center,
              style: TextStyle(color: AppTheme.textSecondary, height: 1.6),
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
