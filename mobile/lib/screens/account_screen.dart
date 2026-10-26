import 'dart:io';

import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';

import '../api/api_client.dart';
import '../api/negev_api.dart';
import '../config.dart';
import '../main.dart';
import '../models/user.dart';
import '../theme.dart';
import '../widgets/async_view.dart'
    show openSupportWhatsApp, showMessage;
import '../widgets/auth_action_button.dart';
import 'live_screen.dart';
import 'my_events_screen.dart';

/// شاشة الحساب: بيانات المستخدم أو دعوة لتسجيل الدخول.
class AccountScreen extends StatelessWidget {
  const AccountScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final auth = AppServices.of(context).auth;

    return AnimatedBuilder(
      animation: auth,
      builder: (context, _) {
        if (!auth.isReady) {
          return const Scaffold(
            body: Center(child: CircularProgressIndicator()),
          );
        }

        final user = auth.user;

        return Scaffold(
          appBar: AppBar(
            title: const Text('حسابي'),
            actions: const [AuthActionButton()],
          ),
          body: user == null
              ? Center(
                  child: Padding(
                    padding: const EdgeInsets.all(30),
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Icon(
                          Icons.person_outline,
                          size: 52,
                          color: context.c.inkFaint,
                        ),
                        const SizedBox(height: 16),
                        Text(
                          'لم تسجّل الدخول بعد',
                          style: TextStyle(
                            fontSize: 17,
                            fontWeight: FontWeight.bold,
                            color: context.c.ink,
                          ),
                        ),
                        const SizedBox(height: 8),
                        Text(
                          'سجّل الدخول لحفظ دفتر نقوطك ومتابعة مناسباتك.',
                          textAlign: TextAlign.center,
                          style: TextStyle(
                            color: context.c.inkSoft,
                            height: 1.6,
                          ),
                        ),
                        const SizedBox(height: 22),
                        ElevatedButton.icon(
                          onPressed: () => Navigator.of(context).push(
                            MaterialPageRoute(
                              builder: (_) => const SignInScreen(),
                            ),
                          ),
                          icon: const Icon(Icons.login),
                          label: const Text('تسجيل الدخول / إنشاء حساب'),
                        ),
                        const SizedBox(height: 14),
                        ElevatedButton.icon(
                          onPressed: () => openSupportWhatsApp(context),
                          icon: const Icon(Icons.support_agent_rounded, color: Colors.white),
                          style: ElevatedButton.styleFrom(
                            backgroundColor: const Color(0xFF25D366),
                            foregroundColor: Colors.white,
                          ),
                          label: const Text('الدعم الفني عبر واتساب'),
                        ),
                        const _LiveRow(),
                        const SizedBox(height: 26),
                        const _ThemeModeTile(),
                      ],
                    ),
                  ),
                )
              : ListView(
                  padding: const EdgeInsets.all(18),
                  children: [
                    Container(
                      padding: const EdgeInsets.all(20),
                      decoration: BoxDecoration(
                        color: context.c.surface,
                        borderRadius: BorderRadius.circular(18),
                        border: Border.all(color: context.c.line),
                      ),
                      child: Column(
                        children: [
                          ClipOval(
                            child: SizedBox(
                              width: 68,
                              height: 68,
                              child: user.avatarUrl == null
                                  ? _avatarFallback(context)
                                  : Image.network(
                                      user.avatarUrl!,
                                      key: const Key('profile_avatar'),
                                      fit: BoxFit.cover,
                                      errorBuilder: (_, _, _) =>
                                          _avatarFallback(context),
                                    ),
                            ),
                          ),
                          const SizedBox(height: 4),
                          TextButton.icon(
                            key: const Key('profile_pick_avatar'),
                            style: TextButton.styleFrom(
                              visualDensity: VisualDensity.compact,
                            ),
                            onPressed: () => _pickAvatar(context),
                            icon: const Icon(
                              Icons.photo_camera_outlined,
                              size: 18,
                            ),
                            label: const Text('غيّر صورتك'),
                          ),
                          Text(
                            user.fullName,
                            style: TextStyle(
                              fontSize: 19,
                              fontWeight: FontWeight.bold,
                              color: context.c.ink,
                            ),
                          ),
                          const SizedBox(height: 6),
                          Text(
                            user.phoneNumber,
                            style: TextStyle(
                              color: context.c.inkSoft,
                            ),
                          ),
                          if (user.clanTown != null) ...[
                            const SizedBox(height: 4),
                            Text(
                              user.clanTown!,
                              style: TextStyle(
                                color: context.c.inkFaint,
                                fontSize: 13,
                              ),
                            ),
                          ],
                          if (user.isAdmin) ...[
                            const SizedBox(height: 10),
                            Container(
                              padding: const EdgeInsets.symmetric(
                                horizontal: 12,
                                vertical: 4,
                              ),
                              decoration: BoxDecoration(
                                color: context.c.sky,
                                borderRadius: BorderRadius.circular(10),
                              ),
                              child: Text(
                                'حساب إدارة',
                                style: TextStyle(
                                  fontSize: 11.5,
                                  color: context.c.onSky,
                                ),
                              ),
                            ),
                          ],
                          const SizedBox(height: 14),
                          Row(
                            children: [
                              Expanded(
                                child: OutlinedButton(
                                  key: const Key('profile_edit_btn'),
                                  onPressed: () => _editProfile(context, user),
                                  child: const Text('عدّل بياناتي'),
                                ),
                              ),
                              const SizedBox(width: 10),
                              Expanded(
                                child: OutlinedButton(
                                  key: const Key('profile_phone_btn'),
                                  onPressed: () => _changePhone(context, user),
                                  child: const Text('عدّل رقمي'),
                                ),
                              ),
                            ],
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 22),
                    OutlinedButton.icon(
                      onPressed: () => Navigator.of(context).push(
                        MaterialPageRoute(builder: (_) => const MyEventsScreen()),
                      ),
                      icon: const Icon(Icons.event_note_outlined),
                      label: const Text('مناسباتي'),
                    ),
                    const SizedBox(height: 14),
                    ElevatedButton.icon(
                      onPressed: () => openSupportWhatsApp(context),
                      icon: const Icon(Icons.support_agent_rounded, color: Colors.white),
                      style: ElevatedButton.styleFrom(
                        backgroundColor: const Color(0xFF25D366),
                        foregroundColor: Colors.white,
                      ),
                      label: const Text('الدعم الفني عبر واتساب'),
                    ),
                    const _LiveRow(),
                    const SizedBox(height: 14),
                    const _ThemeModeTile(),
                    const SizedBox(height: 14),
                    OutlinedButton.icon(
                      onPressed: () async {
                        await auth.signOut();
                        if (context.mounted) {
                          showMessage(context, 'تم تسجيل الخروج');
                        }
                      },
                      icon: const Icon(Icons.logout),
                      label: const Text('تسجيل الخروج'),
                    ),
                    // آخر صفوف الشاشة عمداً: إجراء نهائي بلون الخطر لا يجاور
                    // ما يُقصد كل يوم.
                    const SizedBox(height: 14),
                    const _DeleteAccountRow(),
                    const SizedBox(height: 26),
                    Center(
                      child: Text(
                        'الخادم: ${AppConfig.apiBase}',
                        style: TextStyle(
                          fontSize: 11,
                          color: context.c.inkFaint,
                        ),
                      ),
                    ),
                  ],
                ),
        );
      },
    );
  }
}

/// الصورة البديلة: لا صورة شخصية بعد، أو رابطها لم يُحمَّل (انقطاع، ملف حُذف).
/// نفس دائرة الحساب السابقة — سماء وأيقونة — كي لا يبقى في مكانها فراغ.
Widget _avatarFallback(BuildContext context) {
  return Container(
    color: context.c.sky,
    alignment: Alignment.center,
    child: Icon(Icons.person, size: 36, color: context.c.onSky),
  );
}

/// اختيار صورة من المعرض ورفعها. الإلغاء لا يبلغ الشبكة أصلاً، والفشل يظهر
/// برسالة الخادم العربية كما وصلت.
Future<void> _pickAvatar(BuildContext context) async {
  final services = AppServices.of(context);
  final picked = await ImagePicker().pickImage(
    source: ImageSource.gallery,
    maxWidth: 1024,
    imageQuality: 85,
  );
  if (picked == null) return;

  try {
    final updated = await services.api.uploadAvatar(File(picked.path));
    await services.auth.updateUser(updated);
    if (!context.mounted) return;
    showMessage(context, 'تم تحديث صورتك الشخصية');
  } on ApiException catch (error) {
    if (!context.mounted) return;
    showMessage(context, error.message, isError: true);
  } catch (error) {
    if (!context.mounted) return;
    showMessage(context, '$error', isError: true);
  }
}

/// الاسم والبلدة — الحوار نفسه ينادي الخادم كي يبقى مفتوحاً حين يرفض، ويعود
/// بالمستخدم المحدَّث وحده.
Future<void> _editProfile(BuildContext context, AppUser user) async {
  final services = AppServices.of(context);
  final updated = await showDialog<AppUser>(
    context: context,
    builder: (_) => _EditProfileDialog(user: user, api: services.api),
  );
  if (updated == null || !context.mounted) return;

  await services.auth.updateUser(updated);
  if (!context.mounted) return;
  showMessage(context, 'تم تحديث بيانات حسابك');
}

/// رقم الدخول — الردّ يحمل رمزاً جديداً موقَّعاً بالرقم الجديد، فيُطبَّق كجلسة
/// كاملة لا كمستخدم وحده. ورمز خاطئ أو رقم مسجَّل يبقيان داخل الحوار: الجلسة
/// سليمة، والخطأ في الحقل لا في الدخول.
Future<void> _changePhone(BuildContext context, AppUser user) async {
  final services = AppServices.of(context);
  final result = await showDialog<({AppUser user, String token})>(
    context: context,
    builder: (_) => _ChangePhoneDialog(user: user, api: services.api),
  );
  if (result == null || !context.mounted) return;

  await services.auth.applySession(result.token, result.user);
  if (!context.mounted) return;
  showMessage(context, 'تم تحديث رقم هاتفك — استخدمه في الدخول القادم');
}

/// تعديل الاسم والبلدة داخل الحوار. يعيد المستخدم المحدَّث عند النجاح، و`null`
/// عند الإلغاء؛ والفشل يعرض رسالة الخادم ويترك الحوار مفتوحاً بحقوله.
class _EditProfileDialog extends StatefulWidget {
  const _EditProfileDialog({required this.user, required this.api});

  final AppUser user;
  final NegevApi api;

  @override
  State<_EditProfileDialog> createState() => _EditProfileDialogState();
}

class _EditProfileDialogState extends State<_EditProfileDialog> {
  late final _nameController = TextEditingController(text: widget.user.fullName);
  late final _townController =
      TextEditingController(text: widget.user.clanTown ?? '');
  bool _busy = false;

  @override
  void dispose() {
    _nameController.dispose();
    _townController.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    final fullName = _nameController.text.trim();
    final clanTown = _townController.text.trim();
    // اسم فارغ لا يُرسَل: الخادم سيرفضه بالرسالة نفسها، فلا داعي لطلب شبكة.
    if (fullName.isEmpty) {
      showMessage(context, 'الاسم لا يكون فارغاً', isError: true);
      return;
    }

    setState(() => _busy = true);
    try {
      final updated = await widget.api.updateProfile(
        fullName: fullName,
        clanTown: clanTown.isEmpty ? null : clanTown,
      );
      if (mounted) Navigator.of(context).pop(updated);
    } on ApiException catch (error) {
      if (mounted) showMessage(context, error.message, isError: true);
    } catch (error) {
      if (mounted) showMessage(context, '$error', isError: true);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      backgroundColor: context.c.surfaceSunk,
      title: const Text('تعديل بياناتي'),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          TextField(
            key: const Key('profile_name_field'),
            controller: _nameController,
            textInputAction: TextInputAction.next,
            decoration: const InputDecoration(labelText: 'الاسم الكامل'),
          ),
          const SizedBox(height: 14),
          TextField(
            key: const Key('profile_town_field'),
            controller: _townController,
            decoration: const InputDecoration(labelText: 'البلدة'),
          ),
        ],
      ),
      actions: [
        TextButton(
          onPressed: _busy ? null : () => Navigator.of(context).pop(),
          child: const Text('إلغاء'),
        ),
        TextButton(
          key: const Key('profile_save'),
          onPressed: _busy ? null : _save,
          child: Text(_busy ? 'جارٍ الحفظ…' : 'حفظ'),
        ),
      ],
    );
  }
}

/// تغيير رقم الدخول داخل الحوار. يعيد المستخدم والرمز الجديدين عند النجاح،
/// و`null` عند الإلغاء. رمز PIN خاطئ (400) أو رقم مسجَّل (409) يظهران هنا
/// ويبقيان الحوار مفتوحاً — لا يُخرجان المستخدم من جلسته.
class _ChangePhoneDialog extends StatefulWidget {
  const _ChangePhoneDialog({required this.user, required this.api});

  final AppUser user;
  final NegevApi api;

  @override
  State<_ChangePhoneDialog> createState() => _ChangePhoneDialogState();
}

class _ChangePhoneDialogState extends State<_ChangePhoneDialog> {
  late final _phoneController =
      TextEditingController(text: widget.user.phoneNumber);
  final _pinController = TextEditingController();
  bool _busy = false;

  @override
  void dispose() {
    _phoneController.dispose();
    _pinController.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    setState(() => _busy = true);
    try {
      final result = await widget.api.changePhone(
        phoneNumber: _phoneController.text.trim(),
        pinCode: _pinController.text.trim(),
      );
      if (mounted) Navigator.of(context).pop(result);
    } on ApiException catch (error) {
      if (mounted) showMessage(context, error.message, isError: true);
    } catch (error) {
      if (mounted) showMessage(context, '$error', isError: true);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      backgroundColor: context.c.surfaceSunk,
      title: const Text('تعديل رقمي'),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            'رقمك هو اسم الدخول — ستدخل به من المرّة القادمة',
            style: TextStyle(color: context.c.inkSoft, height: 1.6, fontSize: 13),
          ),
          const SizedBox(height: 14),
          TextField(
            key: const Key('profile_phone_field'),
            controller: _phoneController,
            keyboardType: TextInputType.phone,
            decoration: const InputDecoration(labelText: 'رقم الهاتف'),
          ),
          const SizedBox(height: 14),
          TextField(
            key: const Key('profile_pin_field'),
            controller: _pinController,
            keyboardType: TextInputType.number,
            obscureText: true,
            textInputAction: TextInputAction.done,
            onSubmitted: (_) {
              if (!_busy) _save();
            },
            decoration: const InputDecoration(labelText: 'رمز الدخول الحالي'),
          ),
          const SizedBox(height: 10),
          Text(
            'أدخل رمز الدخول الحالي للتأكيد',
            style: TextStyle(color: context.c.inkFaint, fontSize: 12, height: 1.5),
          ),
        ],
      ),
      actions: [
        TextButton(
          onPressed: _busy ? null : () => Navigator.of(context).pop(),
          child: const Text('إلغاء'),
        ),
        TextButton(
          key: const Key('profile_phone_save'),
          onPressed: _busy ? null : _save,
          child: Text(_busy ? 'جارٍ الحفظ…' : 'حفظ'),
        ),
      ],
    );
  }
}

/// «البث المباشر» — نفس وجهة زر التغذية، ظاهر دائماً وللزائر غير المسجَّل
/// أيضاً: الصفحة نفسها توضح حين لا يوجد بث الآن.
class _LiveRow extends StatelessWidget {
  const _LiveRow();

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(top: 14),
      child: OutlinedButton.icon(
        onPressed: () => openLiveScreen(context),
        icon: const Icon(Icons.live_tv_rounded),
        label: const Text('البث المباشر'),
      ),
    );
  }
}

/// مفتاح المظهر — ثلاث حالات صريحة (نظام/فاتح/داكن) لا مفتاح ثنائي، فالمفتاح
/// الثنائي لا يستطيع التعبير عن "اتّبع النظام".
class _ThemeModeTile extends StatelessWidget {
  const _ThemeModeTile();

  @override
  Widget build(BuildContext context) {
    final themeStore = AppServices.of(context).themeStore;

    return AnimatedBuilder(
      animation: themeStore,
      builder: (context, _) {
        return Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: context.c.surface,
            borderRadius: BorderRadius.circular(18),
            border: Border.all(color: context.c.line),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'مظهر التطبيق',
                style: TextStyle(color: context.c.inkSoft, fontSize: 13),
              ),
              const SizedBox(height: 10),
              SegmentedButton<ThemeMode>(
                segments: const [
                  ButtonSegment(
                    value: ThemeMode.system,
                    label: Text('تلقائي'),
                    icon: Icon(Icons.brightness_auto),
                  ),
                  ButtonSegment(
                    value: ThemeMode.light,
                    label: Text('فاتح'),
                    icon: Icon(Icons.light_mode_outlined),
                  ),
                  ButtonSegment(
                    value: ThemeMode.dark,
                    label: Text('داكن'),
                    icon: Icon(Icons.dark_mode_outlined),
                  ),
                ],
                selected: {themeStore.mode},
                onSelectionChanged: (selection) =>
                    themeStore.setMode(selection.first),
              ),
            ],
          ),
        );
      },
    );
  }
}

/// نصّ التأكيد الأول قبل الحذف.
///
/// يسمّي ما سيُحذف وما سيبقى بلا مواربة: «لا يمكن التراجع» وحدها لا تخبر
/// المستخدم أنّ مناسباته وصوره تبقى على المنصّة بلا اسم ناشر.
const _deleteAccountWarning =
    'سيُحذف حسابك وبياناتك الشخصية: اسمك ورقمك ورمز دخولك وتذكيراتك '
    'وإشعاراتك ودفتر نقوطك ووسومك. المناسبات والصور التي نشرتها تبقى في '
    'المنصة بلا اسم ناشر. لا يمكن التراجع.';

/// «حذف حسابي» — صفّ الخطر الوحيد في الشاشة، وآخر صفوفها.
///
/// ثلاث خطوات: تأكيد صريح يتجاوز «هل أنت متأكد؟»، ثم رمز الدخول (تأكيد هوية
/// على جهاز قد يكون مفتوحاً لغير صاحبه)، ثم النداء ومعه مؤشّر انتظار لا يسمح
/// بأي نقرة أخرى. الحذف نفسه على الخادم؛ هذه الشاشة لا تمسح شيئاً من البيانات،
/// بل تُخرج الجلسة المحلية بعد النجاح (`auth.signOut`) كي لا يبقى على الجهاز
/// حساب محذوف معروضاً.
class _DeleteAccountRow extends StatefulWidget {
  const _DeleteAccountRow();

  @override
  State<_DeleteAccountRow> createState() => _DeleteAccountRowState();
}

class _DeleteAccountRowState extends State<_DeleteAccountRow> {
  /// سلسلة الحوارات جارية أو النداء في الطريق — الزرّ معطّل ومعه مؤشّر.
  bool _busy = false;

  Future<void> _start() async {
    final services = AppServices.of(context);

    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        backgroundColor: dialogContext.c.surfaceSunk,
        icon: Icon(
          Icons.delete_forever_outlined,
          color: dialogContext.c.danger,
          size: 34,
        ),
        title: const Text('حذف حسابي'),
        content: const Text(
          _deleteAccountWarning,
          style: TextStyle(height: 1.7),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(false),
            child: const Text('إلغاء'),
          ),
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(true),
            child: Text(
              'متابعة',
              style: TextStyle(color: dialogContext.c.danger),
            ),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;

    final pinCode = await showDialog<String>(
      context: context,
      builder: (_) => const _DeleteAccountPinDialog(),
    );
    // رمز فارغ لا يُرسَل — ولا استدعاء أصلاً.
    if (pinCode == null || pinCode.isEmpty || !mounted) return;

    setState(() => _busy = true);

    final outcome = await showDialog<Object>(
      context: context,
      barrierDismissible: false,
      builder: (_) => _DeleteAccountProgressDialog(
        onDelete: () => services.api.deleteAccount(pinCode: pinCode),
      ),
    );

    if (outcome == true) {
      // الحساب لم يعد على الخادم. الخروج من الجلسة المحلية واجب حتى لو أُغلقت
      // الشاشة أثناء النداء، فالمستخدم المحفوظ لم يعد له وجود.
      await services.auth.signOut();
      if (!mounted) return;
      setState(() => _busy = false);
      showMessage(context, 'تم حذف حسابك نهائياً');
      return;
    }

    if (!mounted) return;
    setState(() => _busy = false);
    showMessage(
      context,
      outcome is String && outcome.isNotEmpty
          ? outcome
          : 'تعذّر حذف الحساب، حاول مرة أخرى',
      isError: true,
    );
  }

  @override
  Widget build(BuildContext context) {
    return OutlinedButton.icon(
      onPressed: _busy ? null : _start,
      style: OutlinedButton.styleFrom(foregroundColor: context.c.danger),
      icon: _busy
          ? SizedBox(
              width: 16,
              height: 16,
              child: CircularProgressIndicator(
                strokeWidth: 2,
                color: context.c.danger,
              ),
            )
          : const Icon(Icons.delete_forever_outlined),
      label: Text(_busy ? 'جارٍ حذف حسابك…' : 'حذف حسابي'),
    );
  }
}

/// خطوة رمز الدخول — تعيد الرمز مكتوباً، أو `null` عند الإلغاء.
///
/// زرّ الحذف معطّل ما دام الحقل فارغاً، فرمز فارغ لا يبلغ `NegevApi` أصلاً.
class _DeleteAccountPinDialog extends StatefulWidget {
  const _DeleteAccountPinDialog();

  @override
  State<_DeleteAccountPinDialog> createState() =>
      _DeleteAccountPinDialogState();
}

class _DeleteAccountPinDialogState extends State<_DeleteAccountPinDialog> {
  final _controller = TextEditingController();
  bool _canSubmit = false;

  @override
  void initState() {
    super.initState();
    _controller.addListener(_refresh);
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  void _refresh() {
    final canSubmit = _controller.text.trim().isNotEmpty;
    if (canSubmit != _canSubmit) setState(() => _canSubmit = canSubmit);
  }

  void _submit() {
    final pinCode = _controller.text.trim();
    if (pinCode.isEmpty) return;
    Navigator.of(context).pop(pinCode);
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      backgroundColor: context.c.surfaceSunk,
      title: const Text('رمز الدخول'),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            'اكتب رمز دخولك لتأكيد حذف الحساب.',
            style: TextStyle(color: context.c.inkSoft, height: 1.6),
          ),
          const SizedBox(height: 14),
          TextField(
            controller: _controller,
            autofocus: true,
            keyboardType: TextInputType.number,
            obscureText: true,
            textInputAction: TextInputAction.done,
            onSubmitted: (_) {
              if (_canSubmit) _submit();
            },
            decoration: const InputDecoration(labelText: 'رمز PIN'),
          ),
        ],
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.of(context).pop(),
          child: const Text('إلغاء'),
        ),
        TextButton(
          onPressed: _canSubmit ? _submit : null,
          child: Text(
            'حذف حسابي',
            style: TextStyle(color: _canSubmit ? context.c.danger : null),
          ),
        ),
      ],
    );
  }
}

/// نداء الحذف نفسه داخل حوار لا يُغلق بشيء: مؤشّر الانتظار ظاهر وكل الأزرار
/// خلفه معطّلة حتى يعود الخادم. يعيد `true` عند النجاح، أو رسالة الخطأ العربية
/// كما وصلت من الخادم — والمستدعي وحده يعرضها ويقرّر البقاء.
class _DeleteAccountProgressDialog extends StatefulWidget {
  const _DeleteAccountProgressDialog({required this.onDelete});

  final Future<void> Function() onDelete;

  @override
  State<_DeleteAccountProgressDialog> createState() =>
      _DeleteAccountProgressDialogState();
}

class _DeleteAccountProgressDialogState
    extends State<_DeleteAccountProgressDialog> {
  @override
  void initState() {
    super.initState();
    _run();
  }

  Future<void> _run() async {
    try {
      await widget.onDelete();
      if (mounted) Navigator.of(context).pop(true);
    } catch (error) {
      if (mounted) Navigator.of(context).pop('$error');
    }
  }

  @override
  Widget build(BuildContext context) {
    return PopScope(
      canPop: false,
      child: AlertDialog(
        backgroundColor: context.c.surfaceSunk,
        content: Row(
          children: [
            const SizedBox(
              width: 22,
              height: 22,
              child: CircularProgressIndicator(strokeWidth: 2.5),
            ),
            const SizedBox(width: 16),
            Expanded(
              child: Text(
                'جارٍ حذف حسابك…',
                style: TextStyle(color: context.c.ink, height: 1.6),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// تسجيل الدخول وإنشاء الحساب في شاشة واحدة بتبويبين.
class SignInScreen extends StatefulWidget {
  const SignInScreen({super.key});

  @override
  State<SignInScreen> createState() => _SignInScreenState();
}

class _SignInScreenState extends State<SignInScreen> {
  final _phoneController = TextEditingController();
  final _pinController = TextEditingController();
  final _nameController = TextEditingController();

  String? _clanTown;
  bool _isRegistering = false;
  bool _busy = false;

  @override
  void dispose() {
    _phoneController.dispose();
    _pinController.dispose();
    _nameController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final phone = _phoneController.text.trim();
    final pin = _pinController.text.trim();
    final name = _nameController.text.trim();

    if (phone.isEmpty || pin.isEmpty) {
      showMessage(context, 'رقم الهاتف ورمز PIN مطلوبان', isError: true);
      return;
    }
    if (_isRegistering && name.isEmpty) {
      showMessage(context, 'الاسم الكامل مطلوب', isError: true);
      return;
    }
    if (pin.length < 4) {
      showMessage(context, 'رمز PIN يجب أن يكون 4 خانات على الأقل',
          isError: true);
      return;
    }

    setState(() => _busy = true);
    final auth = AppServices.of(context).auth;

    try {
      if (_isRegistering) {
        await auth.register(
          phone: phone,
          fullName: name,
          pin: pin,
          clanTown: _clanTown,
        );
      } else {
        await auth.signIn(phone, pin);
      }

      if (mounted) Navigator.of(context).pop();
    } catch (error) {
      if (mounted) showMessage(context, '$error', isError: true);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(_isRegistering ? 'إنشاء حساب' : 'تسجيل الدخول'),
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(20, 24, 20, 30),
        children: [
          SegmentedButton<bool>(
            segments: const [
              ButtonSegment(value: false, label: Text('دخول')),
              ButtonSegment(value: true, label: Text('حساب جديد')),
            ],
            selected: {_isRegistering},
            onSelectionChanged: (selection) =>
                setState(() => _isRegistering = selection.first),
          ),
          const SizedBox(height: 24),
          if (_isRegistering) ...[
            TextField(
              controller: _nameController,
              decoration: const InputDecoration(labelText: 'الاسم الكامل *'),
            ),
            const SizedBox(height: 14),
          ],
          TextField(
            controller: _phoneController,
            keyboardType: TextInputType.phone,
            decoration: const InputDecoration(
              labelText: 'رقم الهاتف *',
              hintText: '05XXXXXXXX',
            ),
          ),
          const SizedBox(height: 14),
          TextField(
            controller: _pinController,
            keyboardType: TextInputType.number,
            obscureText: true,
            decoration: const InputDecoration(
              labelText: 'رمز PIN *',
              hintText: '4 خانات على الأقل',
            ),
          ),
          if (_isRegistering) ...[
            const SizedBox(height: 14),
            ListenableBuilder(
              listenable: AppServices.of(context).places,
              builder: (context, _) => DropdownButtonFormField<String>(
                initialValue: _clanTown,
                decoration: const InputDecoration(labelText: 'البلدة (اختياري)'),
                items: AppServices.of(context)
                    .places
                    .catalog
                    .towns
                    .map((town) => DropdownMenuItem(value: town, child: Text(town)))
                    .toList(),
                onChanged: (value) => setState(() => _clanTown = value),
              ),
            ),
          ],
          const SizedBox(height: 26),
          ElevatedButton(
            onPressed: _busy ? null : _submit,
            child: Text(
              _busy
                  ? 'جارٍ المعالجة…'
                  : (_isRegistering ? 'إنشاء الحساب' : 'دخول'),
            ),
          ),
        ],
      ),
    );
  }
}
