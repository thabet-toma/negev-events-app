import 'package:flutter/material.dart';

import '../theme.dart';

/// خيار واحد في ورقة فلترة — بلدة (معرّفها اسمها) أو قرية أو نوع مناسبة
/// (معرّفهما رقمي). `icon` زينة عرض بحتة لنوع المناسبة فقط.
class FilterOption {
  const FilterOption({required this.kind, required this.id, required this.label, this.icon});

  final String kind;
  final Object id;
  final String label;
  final String? icon;
}

/// رمز اختيار واحد — يحمل نوعه ومعرّفه معاً كي تتعايش بلدة اسمها «حورة» مع
/// قرية معرّفها ٣ بلا تصادم.
class FilterToken {
  const FilterToken(this.kind, this.id);

  final String kind;
  final Object id;

  @override
  bool operator ==(Object other) => other is FilterToken && other.kind == kind && other.id == id;

  @override
  int get hashCode => Object.hash(kind, id);
}

/// سقف عناصر لكل «نوع» فلتر (بلدة/قرية/نوع مناسبة) بمعزل عن الآخر — مطابق
/// لسقف الخادم لكل معامل قائمة (`?town=` أو `?occasion_type_id=`)، فلا يُبنى
/// طلب سيرفضه الخادم أصلاً بـ400 (#85 خطوة 40-43).
const int filterMaxValuesPerKind = 20;

/// ورقة بحث واختيار متعدّد — رقاقة تفتح ورقة بدل شريط زاحف (#85 خطوة 40-42).
/// تُعيد القائمة الجديدة عند «تطبيق»، أو `null` عند الإلغاء (لا تغيير).
Future<List<FilterToken>?> showMultiSelectFilterSheet(
  BuildContext context, {
  required String title,
  required String searchHint,
  required List<FilterOption> options,
  required List<FilterToken> selected,
}) {
  return showModalBottomSheet<List<FilterToken>>(
    context: context,
    isScrollControlled: true,
    backgroundColor: context.c.surfaceSunk,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(22)),
    ),
    builder: (sheetContext) => _FilterSheetBody(
      title: title,
      searchHint: searchHint,
      options: options,
      initialSelected: selected,
    ),
  );
}

class _FilterSheetBody extends StatefulWidget {
  const _FilterSheetBody({
    required this.title,
    required this.searchHint,
    required this.options,
    required this.initialSelected,
  });

  final String title;
  final String searchHint;
  final List<FilterOption> options;
  final List<FilterToken> initialSelected;

  @override
  State<_FilterSheetBody> createState() => _FilterSheetBodyState();
}

class _FilterSheetBodyState extends State<_FilterSheetBody> {
  late List<FilterToken> _draft = List.of(widget.initialSelected);
  String _query = '';
  String? _warning;

  @override
  Widget build(BuildContext context) {
    final filtered = widget.options
        .where((o) => _query.isEmpty || o.label.contains(_query))
        .toList();

    return Padding(
      padding: EdgeInsets.only(
        left: 18,
        right: 18,
        top: 20,
        bottom: MediaQuery.of(context).viewInsets.bottom + 20,
      ),
      child: ConstrainedBox(
        constraints: BoxConstraints(maxHeight: MediaQuery.of(context).size.height * 0.75),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              widget.title,
              textAlign: TextAlign.center,
              style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold, color: context.c.ink),
            ),
            const SizedBox(height: 14),
            TextField(
              onChanged: (value) => setState(() => _query = value.trim()),
              decoration: InputDecoration(
                hintText: widget.searchHint,
                prefixIcon: const Icon(Icons.search),
                isDense: true,
              ),
            ),
            if (_warning != null) ...[
              const SizedBox(height: 8),
              Text(_warning!, style: TextStyle(color: context.c.danger, fontSize: 12.5)),
            ],
            const SizedBox(height: 8),
            Flexible(
              child: filtered.isEmpty
                  ? Padding(
                      padding: const EdgeInsets.symmetric(vertical: 18),
                      child: Text(
                        'لا نتائج مطابقة',
                        textAlign: TextAlign.center,
                        style: TextStyle(color: context.c.inkFaint),
                      ),
                    )
                  : ListView.builder(
                      shrinkWrap: true,
                      itemCount: filtered.length,
                      itemBuilder: (context, index) {
                        final option = filtered[index];
                        final token = FilterToken(option.kind, option.id);
                        final checked = _draft.contains(token);
                        return CheckboxListTile(
                          value: checked,
                          controlAffinity: ListTileControlAffinity.leading,
                          contentPadding: EdgeInsets.zero,
                          title: Text(
                            option.icon == null || option.icon!.isEmpty
                                ? option.label
                                : '${option.icon} ${option.label}',
                          ),
                          onChanged: (value) => _toggle(option, token, value ?? false),
                        );
                      },
                    ),
            ),
            const SizedBox(height: 10),
            Row(
              children: [
                Expanded(
                  child: OutlinedButton(
                    onPressed: () => Navigator.of(context).pop(),
                    child: const Text('إلغاء'),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: ElevatedButton(
                    onPressed: () => Navigator.of(context).pop(_draft),
                    child: const Text('تطبيق'),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  void _toggle(FilterOption option, FilterToken token, bool checked) {
    if (checked) {
      final sameKindCount = _draft.where((t) => t.kind == option.kind).length;
      if (sameKindCount >= filterMaxValuesPerKind) {
        setState(() => _warning = 'لا يمكن اختيار أكثر من $filterMaxValuesPerKind عنصراً في هذا الفلتر');
        return;
      }
      setState(() {
        _draft = [..._draft, token];
        _warning = null;
      });
    } else {
      setState(() {
        _draft = _draft.where((t) => t != token).toList();
        _warning = null;
      });
    }
  }
}
