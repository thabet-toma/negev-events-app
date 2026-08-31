import 'package:flutter/material.dart';

import '../config.dart';
import '../main.dart';
import '../theme.dart';
import '../widgets/async_view.dart';

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
          appBar: AppBar(title: const Text('حسابي')),
          body: user == null
              ? Center(
                  child: Padding(
                    padding: const EdgeInsets.all(30),
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        const Icon(
                          Icons.person_outline,
                          size: 52,
                          color: AppTheme.textMuted,
                        ),
                        const SizedBox(height: 16),
                        const Text(
                          'لم تسجّل الدخول بعد',
                          style: TextStyle(
                            fontSize: 17,
                            fontWeight: FontWeight.bold,
                            color: AppTheme.textGold,
                          ),
                        ),
                        const SizedBox(height: 8),
                        const Text(
                          'سجّل الدخول لحفظ دفتر نقوطك ومتابعة مناسباتك.',
                          textAlign: TextAlign.center,
                          style: TextStyle(
                            color: AppTheme.textSecondary,
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
                        color: AppTheme.bgSurface,
                        borderRadius: BorderRadius.circular(18),
                        border: Border.all(color: AppTheme.borderSubtle),
                      ),
                      child: Column(
                        children: [
                          const CircleAvatar(
                            radius: 34,
                            backgroundColor: AppTheme.gold,
                            child: Icon(
                              Icons.person,
                              size: 36,
                              color: AppTheme.bgPrimary,
                            ),
                          ),
                          const SizedBox(height: 14),
                          Text(
                            user.fullName,
                            style: const TextStyle(
                              fontSize: 19,
                              fontWeight: FontWeight.bold,
                              color: AppTheme.textGold,
                            ),
                          ),
                          const SizedBox(height: 6),
                          Text(
                            user.phoneNumber,
                            style: const TextStyle(
                              color: AppTheme.textSecondary,
                            ),
                          ),
                          if (user.clanTown != null) ...[
                            const SizedBox(height: 4),
                            Text(
                              user.clanTown!,
                              style: const TextStyle(
                                color: AppTheme.textMuted,
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
                                color: AppTheme.goldDark,
                                borderRadius: BorderRadius.circular(10),
                              ),
                              child: const Text(
                                'حساب إدارة',
                                style: TextStyle(
                                  fontSize: 11.5,
                                  color: Colors.white,
                                ),
                              ),
                            ),
                          ],
                        ],
                      ),
                    ),
                    const SizedBox(height: 22),
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
                    const SizedBox(height: 26),
                    Center(
                      child: Text(
                        'الخادم: ${AppConfig.apiBase}',
                        style: const TextStyle(
                          fontSize: 11,
                          color: AppTheme.textMuted,
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
            DropdownButtonFormField<String>(
              initialValue: _clanTown,
              decoration: const InputDecoration(labelText: 'البلدة (اختياري)'),
              items: AppConfig.towns
                  .map((town) => DropdownMenuItem(value: town, child: Text(town)))
                  .toList(),
              onChanged: (value) => setState(() => _clanTown = value),
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
