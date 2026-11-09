import 'dart:async';

import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../api/api_client.dart';
import '../main.dart';
import '../models/service.dart';
import '../theme.dart';
import '../widgets/async_view.dart';
import '../widgets/auth_action_button.dart';
import '../widgets/congratulations.dart' show openSignInGate;

/// أسماء أيام `hours` السبعة — الفهرس نفسه الذي يخزّنه الأدمن (0 = الأحد).
const List<String> _providerDayNames = [
  'الأحد',
  'الاثنين',
  'الثلاثاء',
  'الأربعاء',
  'الخميس',
  'الجمعة',
  'السبت',
];

/// صفحة مزوّد خدمة واحد — الوصف والصورة ظاهران فوراً، **والرقم لا يظهر نصّاً
/// إطلاقاً**؛ يُكشف فقط عبر فعل تواصل صريح (زرّ «اتصال» يفتح تطبيق الهاتف
/// مباشرة)، نفس نمط اتصال المضيف في `event_details_screen.dart`.
///
/// **وصارت غنية (#184):** الغلاف والشعار، وشارتا «موثّق»/«مميّز»، وجدول ساعات
/// أسبوعي، ومعرض أعمال، وعروض سارية، ومنتجات، ومزوّدون مشابهون يفتح كلٌّ
/// منهم صفحته. **كل قسم فارغ يُخفى**، وزرّ واتساب يستدعي
/// `GET /api/services/providers/:id/whatsapp` ويفتح الرابط الذي يبنيه الخادم
/// — لا يبني الشاشة رابطاً ولا تعرف صيغة الرقم الدولي.
///
/// **والتقييمات (#186):** ★ «المتوسط (العدد)» مع عدّادي 👁/♥، وتوزيع النجوم
/// خمسة أعمدة، وقائمة التعليقات المرقّمة، وورقة كتابة تقييم بنجوم وإقرار الرقم،
/// وحذف تقييم صاحبه. المتوسط والعدد والتوزيع من `visible` وحدها في الخادم،
/// و`my_review` في التفصيل يقول ألصاحب الطلب تقييم أم لا.
class ServiceProviderDetailsScreen extends StatefulWidget {
  const ServiceProviderDetailsScreen({
    super.key,
    required this.providerId,
    this.initialName,
  });

  final int providerId;

  /// اسم المزوّد من صفّ القائمة — يظهر في الترويسة فوراً قبل اكتمال التحميل،
  /// فلا يفرغ العنوان أثناء الانتظار. الوصف والصورة والرقم يبقون بانتظار
  /// الردّ الكامل، ولا بديل مؤقّت لأيٍّ منها.
  final String? initialName;

  @override
  State<ServiceProviderDetailsScreen> createState() =>
      _ServiceProviderDetailsScreenState();
}

class _ServiceProviderDetailsScreenState
    extends State<ServiceProviderDetailsScreen> {
  Future<ServiceProviderDetail>? _provider;

  /// مشاهدة واحدة عند فتح الصفحة (تذكرة #185) — لا في كل بناء. فشلها صامت:
  /// عدّاد المشاهدات لا يجوز أن يكسر صفحة المزوّد.
  bool _viewRecorded = false;

  /// عدّاد المشاهدة بعد ردّ الخادم — قد يزيد واحداً عمّا وصل مع التفصيل،
  /// فالواجهة تعرض ما ردّ به مسار المشاهدة لا قراءة أقدم منه.
  int? _viewsCountOverride;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final api = AppServices.of(context).api;
    if (_provider == null) {
      _provider = api.serviceProviderDetails(widget.providerId);
      if (!_viewRecorded) {
        _viewRecorded = true;
        unawaited(
          api.recordProviderView(widget.providerId).then(
            (result) {
              if (mounted) {
                setState(() => _viewsCountOverride = result.viewsCount);
              }
            },
            onError: (Object _) {
              // فشل المشاهدة لا يغيّر الصفحة — العدّاد يبقى ما وصل مع التفصيل.
            },
          ),
        );
      }
    }
  }

  Future<void> _call(String phone) async {
    final uri = Uri(scheme: 'tel', path: phone);
    if (!await launchUrl(uri)) {
      if (mounted) showMessage(context, 'تعذّر إجراء الاتصال', isError: true);
    }
  }

  /// رابط واتساب من الخادم — الرسالة والرقم الدولي هناك، والشاشة تفتح `url`.
  Future<void> _openWhatsApp(int providerId) async {
    try {
      final url = await AppServices.of(context).api.providerWhatsapp(providerId);
      if (!await launchUrl(Uri.parse(url), mode: LaunchMode.externalApplication)) {
        if (mounted) showMessage(context, 'تعذّر فتح تطبيق واتساب', isError: true);
      }
    } catch (error) {
      if (!mounted) return;
      showMessage(
        context,
        error is ApiException ? error.message : 'تعذّر فتح تطبيق واتساب',
        isError: true,
      );
    }
  }

  /// مزوّد مشابه يُفتح فوق الصفحة الحالية — لا استبدال، فالرجوع يعود إليها.
  Future<void> _openProvider(ServiceProvider candidate) async {
    await Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => ServiceProviderDetailsScreen(
          providerId: candidate.id,
          initialName: candidate.name,
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(widget.initialName ?? 'مزوّد خدمة'),
        actions: const [AuthActionButton()],
      ),
      body: FutureBuilder<ServiceProviderDetail>(
        future: _provider,
        builder: (context, snapshot) {
          return AsyncView<ServiceProviderDetail>(
            snapshot: snapshot,
            onRetry: () => setState(() {
              _provider = AppServices.of(context)
                  .api
                  .serviceProviderDetails(widget.providerId);
            }),
            builder: (provider) => _ProviderBody(
              provider: provider,
              viewsCount: _viewsCountOverride ?? provider.viewsCount,
              onCall: () => _call(provider.phone),
              onWhatsApp: () => _openWhatsApp(provider.id),
              onOpenSimilar: _openProvider,
            ),
          );
        },
      ),
    );
  }
}

class _ProviderBody extends StatefulWidget {
  const _ProviderBody({
    required this.provider,
    required this.viewsCount,
    required this.onCall,
    required this.onWhatsApp,
    required this.onOpenSimilar,
  });

  final ServiceProviderDetail provider;

  /// عدّاد المشاهدة المعروض — التفصيل أولاً، ثم ردّ مسار المشاهدة إن سبقه.
  final int viewsCount;

  final VoidCallback onCall;
  final VoidCallback onWhatsApp;
  final ValueChanged<ServiceProvider> onOpenSimilar;

  @override
  State<_ProviderBody> createState() => _ProviderBodyState();
}

/// جسم الصفحة حالةٌ محلية لزرّ الحفظ وحده (تذكرة #185): الحالة والعدّاد من
/// ردّ الخادم، فلا زيادة محلية على العدّاد ولا زرّ يكذب قبل تأكيد الخادم.
class _ProviderBodyState extends State<_ProviderBody> {
  ServiceProviderDetail get provider => widget.provider;

  late bool _isFavorite = provider.isFavorite;
  late int _favoritesCount = provider.favoritesCount;
  bool _savingFavorite = false;

  // تقييمات المزوّد (تذكرة #186): المتوسط والعدد والتوزيع وتقييم صاحب
  // الطلب — كلها من الخادم وحده، وتتحدّث بردّ كل كتابة أو حذف.
  late double? _ratingAvg = provider.ratingAvg;
  late int _ratingCount = provider.ratingCount;
  late Map<int, int> _ratingDistribution = provider.ratingDistribution;
  late ProviderReview? _myReview = provider.myReview;

  final List<ProviderReview> _reviews = [];
  int _reviewsPage = 0;
  int _reviewsTotalPages = 0;
  bool _reviewsRequested = false;
  bool _loadingReviews = false;
  bool _reviewsFailed = false;
  /// طلب إعادة قراءة وصل أثناء قراءة جارية (بعد كتابة أو حذف): يُنفَّذ فور
  /// انتهائها بدل إسقاطه، وإلا عاد الردّ القديم فأحيا تقييماً حُذف للتوّ.
  bool _reloadReviewsAfterCurrent = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    // التعليقات تُقرأ مرة عند أول بناء — لا في كل `build`، ولا في `initState`
    // حيث لا يصحّ الوصول إلى `AppServices.of(context)`.
    if (!_reviewsRequested) {
      _reviewsRequested = true;
      unawaited(_loadReviews());
    }
  }

  @override
  void didUpdateWidget(covariant _ProviderBody oldWidget) {
    super.didUpdateWidget(oldWidget);
    // صفحة أخرى في الموضع نفسه (إعادة محاولة جلبت مزوّداً آخر): الحالة
    // المحلية تبدأ من بيانات المزوّد الجديد لا من مزوّد سابق.
    if (oldWidget.provider.id != widget.provider.id) {
      _isFavorite = widget.provider.isFavorite;
      _favoritesCount = widget.provider.favoritesCount;
      _ratingAvg = widget.provider.ratingAvg;
      _ratingCount = widget.provider.ratingCount;
      _ratingDistribution = widget.provider.ratingDistribution;
      _myReview = widget.provider.myReview;
      _reviews.clear();
      _reviewsPage = 0;
      _reviewsTotalPages = 0;
      _reviewsFailed = false;
      _reloadReviewsAfterCurrent = false;
      unawaited(_loadReviews());
    }
  }

  /// حفظ/إلغاء حفظ المزوّد — PUT/DELETE عبر `negev_api.dart` وحده. الزائر
  /// يُحوَّل إلى بوابة الدخول القائمة، فيعود إلى الصفحة ويحفظ بعد الدخول.
  Future<void> _toggleFavorite() async {
    final services = AppServices.of(context);
    if (!services.auth.isSignedIn) {
      openSignInGate(context, 'سجّل الدخول لحفظ المزوّد في قائمتك');
      return;
    }
    if (_savingFavorite) return;

    setState(() => _savingFavorite = true);
    try {
      final result = await services.api.setProviderFavorite(
        provider.id,
        !_isFavorite,
      );
      if (!mounted) return;
      setState(() {
        _isFavorite = result.isFavorite;
        _favoritesCount = result.favoritesCount;
      });
      showMessage(
        context,
        result.isFavorite
            ? 'حُفظ المزوّد في «مزوّدون محفوظون»'
            : 'أُزيل المزوّد من محفوظاتك',
      );
    } catch (error) {
      if (mounted) showMessage(context, '$error', isError: true);
    } finally {
      if (mounted) setState(() => _savingFavorite = false);
    }
  }

  /// «اطلب عرض سعر» (تذكرة #188، ADR-0016): الزائر يُحوَّل إلى بوابة الدخول
  /// القائمة، والورقة تُرسل عبر `negev_api.dart` وحده. والردّ يفترق بحسب
  /// `channel` — `app` طلبٌ كُتب لمزوّد مربوط، و`whatsapp` رابطٌ بناه الخادم
  /// بلا صفّ فيُفتح كما وصل: الشاشة لا تؤلّف رسالة ولا تعرف رقم المزوّد.
  Future<void> _openQuoteSheet() async {
    final services = AppServices.of(context);
    if (!services.auth.isSignedIn) {
      openSignInGate(context, 'سجّل الدخول لطلب عرض سعر من المزوّد');
      return;
    }

    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (_) => _QuoteSheet(
        providerName: provider.name,
        onSubmit: _submitQuote,
      ),
    );
  }

  Future<void> _submitQuote({
    String? wantedDate,
    int? guestsCount,
    String? note,
  }) async {
    final services = AppServices.of(context);
    final result = await services.api.requestProviderQuote(
      provider.id,
      wantedDate: wantedDate,
      guestsCount: guestsCount,
      note: note,
    );
    if (!mounted) return;

    if (result.isWhatsApp) {
      final url = result.url;
      if (url != null && url.isNotEmpty) {
        if (!await launchUrl(Uri.parse(url), mode: LaunchMode.externalApplication)) {
          if (mounted) showMessage(context, 'تعذّر فتح تطبيق واتساب', isError: true);
        }
      }
      if (mounted) {
        showMessage(context, result.message ?? 'أكمل طلبك في واتساب برسالة جاهزة');
      }
      return;
    }

    showMessage(context, result.message ?? 'وصل طلبك إلى المزوّد');
  }

  /// صفحة تعليقات — `append` يضيف الصفحة التالية، وإلا فمن الأولى من جديد.
  /// فشلها صامت: التعليقات قسمٌ لا يجوز أن يكسر صفحة المزوّد.
  Future<void> _loadReviews({bool append = false}) async {
    if (_loadingReviews) {
      if (!append) _reloadReviewsAfterCurrent = true;
      return;
    }
    _loadingReviews = true;
    _reviewsFailed = false;
    final providerId = provider.id;
    try {
      final page = append ? _reviewsPage + 1 : 1;
      final result = await AppServices.of(context).api.providerReviews(
            providerId,
            page: page,
          );
      // ردّ مزوّد سابق لا يُرسم فوق مزوّد فُتح بعده في الموضع نفسه.
      if (!mounted || provider.id != providerId) return;
      setState(() {
        if (!append) _reviews.clear();
        _reviews.addAll(result.reviews);
        _reviewsPage = result.pagination.page;
        _reviewsTotalPages = result.pagination.totalPages;
      });
    } catch (_) {
      // المتوسط والتوزيع من التفصيل، لكن فشل القراءة لا يُترك صامتاً أبدياً:
      // زرّ إعادة المحاولة يظهر مكان القائمة الفارغة.
      if (mounted) setState(() => _reviewsFailed = true);
    } finally {
      _loadingReviews = false;
      if (_reloadReviewsAfterCurrent && mounted) {
        _reloadReviewsAfterCurrent = false;
        unawaited(_loadReviews());
      }
    }
  }

  /// «اكتب تقييمك»: الزائر يُحوَّل إلى بوابة الدخول، والورقة تُعبَّأ من تقييم
  /// صاحبه إن وُجد فالتعديل يستبدل ولا يضيف ثانياً.
  Future<void> _openReviewSheet() async {
    final services = AppServices.of(context);
    if (!services.auth.isSignedIn) {
      openSignInGate(context, 'سجّل الدخول لتقييم المزوّد');
      return;
    }

    // قد يكون المستخدم سجّل الدخول بعد تحميل الصفحة، فـ`my_review` المحمَّل
    // قديم (null). تُقرأ الصفحة مرة أخرى قبل فتح الورقة كي لا يفقد صاحب
    // التقييم زرّ الحذف ويقرأ «بلّغ» على تقييمه هو.
    if (_myReview == null) {
      try {
        final detail = await services.api.serviceProviderDetails(provider.id);
        if (!mounted) return;
        setState(() {
          _myReview = detail.myReview;
          _ratingAvg = detail.ratingAvg;
          _ratingCount = detail.ratingCount;
          _ratingDistribution = detail.ratingDistribution;
        });
      } catch (_) {
        // فشل التحديث لا يمنع الكتابة — الـupsert في الخادم يحسم التكرار.
      }
    }

    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (_) => _ReviewSheet(
        initialReview: _myReview,
        onSubmit: _saveReview,
        onDelete: _myReview == null ? null : _deleteMyReview,
      ),
    );
  }

  Future<void> _saveReview(int rating, String body, bool confirmPhone) async {
    final result = await AppServices.of(context).api.submitProviderReview(
          provider.id,
          rating: rating,
          body: body,
          confirmPhone: confirmPhone,
        );
    if (!mounted) return;
    setState(() {
      _myReview = result.review;
      _ratingAvg = result.summary.ratingAvg;
      _ratingCount = result.summary.ratingCount;
      _ratingDistribution = result.summary.ratingDistribution;
    });
    await _loadReviews();
    if (mounted) showMessage(context, 'نُشر تقييمك — شكراً لك');
  }

  /// حذف تقييمي من بطاقة التعليق نفسها — بتأكيد، كي لا تمسح ضغطةٌ خاطئة
  /// كلام المرء. الورقة لها تأكيدها قبل `_deleteMyReview`.
  Future<void> _confirmDeleteMyReview() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('حذف تقييمي'),
        content: const Text('هل تحذف تقييمك عن هذا المزوّد؟'),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(false),
            child: const Text('إلغاء'),
          ),
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(true),
            child: const Text('احذف'),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;
    await _deleteMyReview();
  }

  Future<void> _deleteMyReview() async {
    try {
      final summary =
          await AppServices.of(context).api.deleteProviderReview(provider.id);
      if (!mounted) return;
      if (summary != null) {
        setState(() {
          _myReview = null;
          _ratingAvg = summary.ratingAvg;
          _ratingCount = summary.ratingCount;
          _ratingDistribution = summary.ratingDistribution;
        });
      }
      await _loadReviews();
      if (mounted) {
        showMessage(
          context,
          summary == null ? 'لا تقييم لك على هذا المزوّد' : 'حُذف تقييمك',
        );
      }
    } catch (error) {
      if (mounted) showMessage(context, '$error', isError: true);
    }
  }

  /// بلاغ عن تقييم غيره — عند العتبة يخفيه الخادم، فتُقرأ الأرقام من جديد.
  Future<void> _reportReview(ProviderReview review) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('بلاغ عن تقييم'),
        content: const Text('هل تبلّغ الإدارة عن هذا التقييم؟'),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(false),
            child: const Text('إلغاء'),
          ),
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(true),
            child: const Text('بلّغ'),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;

    try {
      final result = await AppServices.of(context)
          .api
          .reportProviderReview(provider.id, review.id);
      if (!mounted) return;
      if (result.status == 'hidden') {
        final detail =
            await AppServices.of(context).api.serviceProviderDetails(provider.id);
        if (!mounted) return;
        setState(() {
          _ratingAvg = detail.ratingAvg;
          _ratingCount = detail.ratingCount;
          _ratingDistribution = detail.ratingDistribution;
        });
        await _loadReviews();
        if (mounted) showMessage(context, 'أُخفي التقييم بعد البلاغات');
      } else {
        showMessage(context, 'تم إبلاغ الإدارة عن التقييم');
      }
    } catch (error) {
      if (mounted) showMessage(context, '$error', isError: true);
    }
  }

  /// تاريخ التعليق كما يراه المستخدم — تاريخ غير صالح لا يكسر الصفّ.
  String _reviewDateLabel(String? raw) {
    final date = raw == null ? null : DateTime.tryParse(raw);
    if (date == null) return '';
    final local = date.toLocal();
    final day = local.day.toString().padLeft(2, '0');
    final month = local.month.toString().padLeft(2, '0');
    return '${local.year}/$month/$day';
  }

  /// عمود نجوم واحد من التوزيع: العدد فوق العمود وارتفاعه نسبةٌ إلى أكثر
  /// النجوم تكراراً (لا إلى المجموع) كي يبقى الرسم مقروءاً.
  Widget _distributionColumn(int stars) {
    final count = _ratingDistribution[stars] ?? 0;
    final maxCount = _ratingDistribution.values.fold<int>(
      0,
      (max, value) => value > max ? value : max,
    );
    final ratio = maxCount == 0 ? 0.0 : count / maxCount;
    final barHeight = count == 0 ? 2.0 : (ratio * 64).clamp(6.0, 64.0);
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(
          '$count',
          key: Key('provider_rating_dist_count_$stars'),
          style: TextStyle(fontSize: 10.5, color: context.c.inkFaint),
        ),
        const SizedBox(height: 3),
        SizedBox(
          height: 64,
          child: Align(
            alignment: Alignment.bottomCenter,
            child: Container(
              width: 18,
              height: barHeight,
              decoration: BoxDecoration(
                color: count == 0 ? context.c.line : context.c.gold,
                borderRadius: const BorderRadius.vertical(top: Radius.circular(4)),
              ),
            ),
          ),
        ),
        const SizedBox(height: 3),
        Text(
          '$stars★',
          style: TextStyle(fontSize: 10.5, color: context.c.inkFaint),
        ),
      ],
    );
  }

  /// تعليق واحد: الاسم من الخادم، والنجوم، والنصّ، ثم حذف صاحبه أو بلاغ غيره.
  ///
  /// **وردّ المزوّد المربوط (تذكرة #187):** اقتباس تحت التعليق — بحدّ ذهبي
  /// وتسمية مكتوبة، فلا يحمل اللون وحده المعنى — وزرّ الردّ لهذا الحساب وحده
  /// (`canReply`)، ونصّه «عدّل الردّ» حين يكون هناك ردّ قائم.
  Widget _reviewTile(ProviderReview review) {
    final mine = review.isMine ||
        review.canDelete ||
        (_myReview != null && _myReview!.id == review.id);
    final replyText = (review.replyBody ?? '').trim();
    final replyDate = _reviewDateLabel(review.replyAt);
    return Container(
      key: Key('provider_review_${review.id}'),
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        border: Border.all(color: context.c.line),
        borderRadius: BorderRadius.circular(10),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  review.userName.isEmpty ? 'مستخدم' : review.userName,
                  style: TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.bold,
                    color: context.c.ink,
                  ),
                ),
              ),
              Text(
                '★' * review.rating + '☆' * (5 - review.rating),
                key: Key('provider_review_stars_${review.id}'),
                style: TextStyle(
                  fontSize: 13,
                  color: context.c.gold,
                  letterSpacing: 1.5,
                ),
              ),
            ],
          ),
          if (review.body != null) ...[
            const SizedBox(height: 5),
            Text(
              review.body!,
              style: TextStyle(fontSize: 12.5, color: context.c.inkSoft, height: 1.5),
            ),
          ],
          if (replyText.isNotEmpty) ...[
            const SizedBox(height: 8),
            Container(
              key: Key('provider_review_reply_${review.id}'),
              width: double.infinity,
              padding: const EdgeInsets.fromLTRB(10, 8, 10, 8),
              decoration: BoxDecoration(
                color: context.c.surfaceSunk,
                borderRadius: BorderRadius.circular(10),
                border: Border.all(color: context.c.gold),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Icon(Icons.reply, size: 14, color: context.c.gold),
                      const SizedBox(width: 6),
                      Text(
                        'ردّ المزوّد',
                        style: TextStyle(
                          fontSize: 11.5,
                          fontWeight: FontWeight.w800,
                          color: context.c.gold,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 4),
                  Text(
                    replyText,
                    key: Key('provider_review_reply_body_${review.id}'),
                    style: TextStyle(fontSize: 12.5, color: context.c.ink, height: 1.5),
                  ),
                  if (replyDate.isNotEmpty) ...[
                    const SizedBox(height: 4),
                    Text(
                      replyDate,
                      key: Key('provider_review_reply_date_${review.id}'),
                      style: TextStyle(fontSize: 10.5, color: context.c.inkFaint),
                    ),
                  ],
                ],
              ),
            ),
          ],
          Row(
            children: [
              Expanded(
                child: Text(
                  _reviewDateLabel(review.createdAt),
                  style: TextStyle(fontSize: 10.5, color: context.c.inkFaint),
                ),
              ),
              if (review.canReply)
                TextButton(
                  key: Key('provider_review_reply_btn_${review.id}'),
                  onPressed: () => _openReplySheet(review),
                  child: Text(replyText.isEmpty ? 'ردّ على التقييم' : 'عدّل الردّ'),
                ),
              if (mine)
                TextButton(
                  key: Key('provider_review_delete_${review.id}'),
                  onPressed: _confirmDeleteMyReview,
                  child: const Text('حذف تقييمي'),
                )
              else
                TextButton(
                  key: Key('provider_review_report_${review.id}'),
                  onPressed: () => _reportReview(review),
                  child: const Text('بلّغ'),
                ),
            ],
          ),
        ],
      ),
    );
  }

  /// ورقة ردّ المزوّد المربوط: نصّ واحد (≤1000) يُرسل بـ`PUT …/reply`، والحفظ
  /// يستبدل الردّ القائم. الصلاحية في الخادم داخل الاستعلام، والزرّ لا يظهر
  /// إلا لمن `canReply` — ومع ذلك يُرسل الخادم 404 لغيره.
  Future<void> _openReplySheet(ProviderReview review) async {
    final services = AppServices.of(context);
    if (!services.auth.isSignedIn) {
      openSignInGate(context, 'سجّل الدخول للردّ على التقييم');
      return;
    }

    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (_) => _ReplySheet(
        initialReply: review.replyBody,
        onSubmit: (text) => _saveReply(review, text),
      ),
    );
  }

  Future<void> _saveReply(ProviderReview review, String text) async {
    final updated = await AppServices.of(context).api.replyToProviderReview(
          review.id,
          replyBody: text,
        );
    if (!mounted) return;
    setState(() {
      final index = _reviews.indexWhere((entry) => entry.id == review.id);
      if (index >= 0) _reviews[index] = updated;
      // `my_review` الصفّ نفسه إن كان هذا التقييم تقييم صاحبه المربوط أيضاً.
      if (_myReview != null && _myReview!.id == review.id) _myReview = updated;
    });
    if (mounted) showMessage(context, 'حُفظ ردّك على التقييم');
  }

  String _priceBadgeText() {
    switch (provider.priceType) {
      case 'contact':
        return 'تواصل للسعر';
      case 'starting_at':
        return 'ابتداءً من';
      case 'fixed':
        return 'سعر محدد';
      case 'estimated':
      default:
        return 'سعر تقديري';
    }
  }

  /// عدّاد واحد (👁/♥) — القيمة مُسنَدة إلى مفتاح يسهل على الاختبار قراءته
  /// بعد ردّ الخادم، والنصّ نفسه هو ما يراه المستخدم.
  Widget _stat({
    required Key valueKey,
    required String icon,
    required String value,
    required String label,
  }) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(
          icon,
          style: TextStyle(fontSize: 14, color: context.c.inkFaint),
        ),
        const SizedBox(width: 4),
        Text(
          value,
          key: valueKey,
          style: TextStyle(
            fontSize: 13.5,
            fontWeight: FontWeight.bold,
            color: context.c.inkSoft,
          ),
        ),
        const SizedBox(width: 3),
        Text(
          label,
          style: TextStyle(fontSize: 11.5, color: context.c.inkFaint),
        ),
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.only(bottom: 28),
      children: [
        _ProviderHeader(provider: provider),
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 16, 16, 0),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              if (provider.logoUrl != null) ...[
                ClipOval(
                  child: CachedNetworkImage(
                    key: const Key('provider_logo'),
                    imageUrl: provider.logoUrl!,
                    width: 64,
                    height: 64,
                    fit: BoxFit.cover,
                    errorWidget: (_, _, _) => Container(
                      width: 64,
                      height: 64,
                      color: context.c.surfaceSunk,
                      child: Icon(Icons.storefront_outlined, size: 22, color: context.c.inkFaint),
                    ),
                  ),
                ),
                const SizedBox(height: 10),
              ],
              if (provider.isVerified || provider.isFeatured) ...[
                _ProviderBadges(provider: provider),
                const SizedBox(height: 10),
              ],
              Row(
                children: [
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                    decoration: BoxDecoration(
                      color: context.c.skyWash,
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: Text(
                      provider.categoryName,
                      style: TextStyle(fontSize: 12.5, color: context.c.sky, fontWeight: FontWeight.bold),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                    decoration: BoxDecoration(
                      color: context.c.gold.withValues(alpha: 0.15),
                      borderRadius: BorderRadius.circular(10),
                      border: Border.all(color: context.c.gold.withValues(alpha: 0.3)),
                    ),
                    child: Text(
                      _priceBadgeText(),
                      style: TextStyle(fontSize: 12, color: context.c.gold, fontWeight: FontWeight.bold),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 10),
              Text(
                provider.name,
                style: TextStyle(fontSize: 22, fontWeight: FontWeight.bold, color: context.c.ink),
              ),
              const SizedBox(height: 8),
              // عدّادا الصفحة (تذكرة #185): 👁 المشاهدات و♥ المفضّلة — من
              // الخادم وحده، والعدّاد الثاني يتغيّر بردّ زرّ الحفظ تحته.
              Row(
                key: const Key('provider_stats'),
                children: [
                  _stat(
                    valueKey: const Key('provider_views_count'),
                    icon: '👁',
                    value: '${widget.viewsCount}',
                    label: 'مشاهدة',
                  ),
                  const SizedBox(width: 14),
                  _stat(
                    valueKey: const Key('provider_favorites_count'),
                    icon: '♥',
                    value: '$_favoritesCount',
                    label: 'من حفظوه',
                  ),
                  // ★ المتوسط (العدد) — تذكرة #186. مزوّد بلا تقييمات لا نجمته:
                  // «0.0» تقول «سيّئ» عن مزوّد لم يقيّمه أحد.
                  if (_ratingCount > 0) ...[
                    const SizedBox(width: 14),
                    _stat(
                      valueKey: const Key('provider_rating_stat_value'),
                      icon: '★',
                      value: _ratingAvg == null
                          ? '—'
                          : _ratingAvg!.toStringAsFixed(1),
                      label: '($_ratingCount تقييم)',
                    ),
                  ],
                ],
              ),
              const SizedBox(height: 10),
              SizedBox(
                width: double.infinity,
                child: OutlinedButton.icon(
                  key: const Key('provider_favorite_btn'),
                  onPressed: _savingFavorite ? null : _toggleFavorite,
                  icon: Icon(
                    _isFavorite ? Icons.favorite : Icons.favorite_border,
                    size: 18,
                  ),
                  label: Text(_isFavorite ? 'محفوظ' : 'احفظ المزوّد'),
                  style: OutlinedButton.styleFrom(
                    minimumSize: const Size.fromHeight(44),
                    foregroundColor: _isFavorite ? context.c.gold : context.c.sky,
                    side: BorderSide(
                      color: _isFavorite ? context.c.gold : context.c.line,
                    ),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(10),
                    ),
                  ),
                ),
              ),
              const SizedBox(height: 10),
              SizedBox(
                width: double.infinity,
                child: OutlinedButton.icon(
                  key: const Key('provider_quote_btn'),
                  onPressed: _openQuoteSheet,
                  icon: const Icon(Icons.request_quote_outlined, size: 18),
                  label: const Text('اطلب عرض سعر'),
                  style: OutlinedButton.styleFrom(
                    minimumSize: const Size.fromHeight(44),
                    foregroundColor: context.c.sky,
                    side: BorderSide(color: context.c.line),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(10),
                    ),
                  ),
                ),
              ),
              const SizedBox(height: 10),
              // `ClipRRect` بدل `borderRadius` على `Border` غير موحّد اللون:
              // Flutter في وضع debug يرمي «A borderRadius can only be given on
              // borders with uniform colors» حين تختلف ألوان الجوانب، فينفجر
              // بناء الشاشة كلها. القصّ الخارجي يعطي الزوايا المستديرة نفسها
              // ويحفظ لون كل جانب وسماكته بلا تغيير مرئي.
              ClipRRect(
                borderRadius: BorderRadius.circular(12),
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                  decoration: BoxDecoration(
                    color: context.c.gold.withValues(alpha: 0.12),
                    border: Border(
                      right: BorderSide(color: context.c.gold, width: 4),
                      top: BorderSide(color: context.c.gold.withValues(alpha: 0.3)),
                      left: BorderSide(color: context.c.gold.withValues(alpha: 0.3)),
                      bottom: BorderSide(color: context.c.gold.withValues(alpha: 0.3)),
                    ),
                  ),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            _priceBadgeText(),
                            style: TextStyle(fontSize: 12, color: context.c.inkSoft, fontWeight: FontWeight.bold),
                          ),
                          const SizedBox(height: 2),
                          Text(
                            provider.price != null ? '${provider.price} ₪' : 'تواصل للسعر',
                            style: TextStyle(
                              fontSize: 20,
                              fontWeight: FontWeight.w900,
                              color: context.c.gold,
                            ),
                          ),
                        ],
                      ),
                      Row(
                        children: [
                          Icon(Icons.handshake_outlined, size: 16, color: context.c.inkSoft),
                          const SizedBox(width: 4),
                          Text('اتفاق مباشر', style: TextStyle(fontSize: 12, color: context.c.inkSoft)),
                        ],
                      ),
                    ],
                  ),
                ),
              ),

              // Benchmark package description banner
              if (provider.priceEstimateDesc != null && provider.priceEstimateDesc!.isNotEmpty) ...[
                const SizedBox(height: 12),
                Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: context.c.gold.withValues(alpha: 0.08),
                    borderRadius: BorderRadius.circular(10),
                    border: Border.all(color: context.c.gold.withValues(alpha: 0.4)),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Icon(Icons.calculate_outlined, size: 16, color: context.c.gold),
                          const SizedBox(width: 6),
                          Text(
                            '📦 حزمة نموذجية استرشادية بهذا السعر:',
                            style: TextStyle(
                              fontSize: 12.5,
                              fontWeight: FontWeight.bold,
                              color: context.c.gold,
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 5),
                      Text(
                        provider.priceEstimateDesc!,
                        style: TextStyle(
                          fontSize: 13.5,
                          fontWeight: FontWeight.bold,
                          color: context.c.ink,
                          height: 1.4,
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        '* مثال توضيحي لتقدير التكلفة، والكميات والمواصفات قابلة للزيادة أو التعديل بالاتفاق المباشر مع المزوّد',
                        style: TextStyle(
                          fontSize: 11,
                          fontStyle: FontStyle.italic,
                          color: context.c.inkFaint,
                          height: 1.3,
                        ),
                      ),
                    ],
                  ),
                ),
              ],

              const SizedBox(height: 12),
              if (provider.towns.isNotEmpty)
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Icon(Icons.location_on_outlined, size: 17, color: context.c.sky),
                    const SizedBox(width: 9),
                    Expanded(
                      child: Text(
                        provider.towns.join('، '),
                        style: TextStyle(color: context.c.ink, fontSize: 14.5, height: 1.45),
                      ),
                    ),
                  ],
                ),
              if (provider.description != null && provider.description!.trim().isNotEmpty) ...[
                const SizedBox(height: 14),
                Text(
                  provider.description!,
                  style: TextStyle(fontSize: 14.5, color: context.c.inkSoft, height: 1.6),
                ),
              ],

              // ساعات العمل (#184) — جدول أسبوعي، ويُخفى كاملاً بلا ساعات.
              if (provider.hours.isNotEmpty) ...[
                const SizedBox(height: 20),
                _SectionTitle(title: 'ساعات العمل', icon: Icons.schedule_outlined),
                const SizedBox(height: 8),
                Column(
                  key: const Key('provider_hours_section'),
                  children: (List<ServiceProviderHours>.from(provider.hours)
                        ..sort((left, right) => left.day.compareTo(right.day)))
                      .map((hours) => Padding(
                            key: Key('provider_hours_row_${hours.day}'),
                            padding: const EdgeInsets.symmetric(vertical: 4),
                            child: Row(
                              mainAxisAlignment: MainAxisAlignment.spaceBetween,
                              children: [
                                Text(
                                  hours.day >= 0 && hours.day < _providerDayNames.length
                                      ? _providerDayNames[hours.day]
                                      : '${hours.day}',
                                  style: TextStyle(fontSize: 13.5, color: context.c.inkSoft),
                                ),
                                Text(
                                  hours.closed ? 'مغلق' : '${hours.from} — ${hours.to}',
                                  style: TextStyle(
                                    fontSize: 13.5,
                                    fontWeight: FontWeight.bold,
                                    color: hours.closed ? context.c.inkFaint : context.c.ink,
                                  ),
                                ),
                              ],
                            ),
                          ))
                      .toList(),
                ),
              ],

              // معرض الأعمال (#184): شبكة ثلاثية، وتعليق تحت الصورة إن وُجد.
              if (provider.gallery.isNotEmpty) ...[
                const SizedBox(height: 20),
                _SectionTitle(title: 'معرض الأعمال', icon: Icons.photo_library_outlined),
                const SizedBox(height: 8),
                GridView.count(
                  key: const Key('provider_gallery_section'),
                  crossAxisCount: 3,
                  shrinkWrap: true,
                  physics: const NeverScrollableScrollPhysics(),
                  mainAxisSpacing: 6,
                  crossAxisSpacing: 6,
                  childAspectRatio: 0.95,
                  children: provider.gallery
                      .map((photo) => Column(
                            key: Key('provider_gallery_photo_${photo.id}'),
                            crossAxisAlignment: CrossAxisAlignment.stretch,
                            children: [
                              Expanded(
                                child: ClipRRect(
                                  borderRadius: BorderRadius.circular(8),
                                  child: CachedNetworkImage(
                                    imageUrl: photo.imageUrl,
                                    fit: BoxFit.cover,
                                    errorWidget: (_, _, _) => Container(
                                      color: context.c.surfaceSunk,
                                      child: Icon(Icons.image_not_supported_outlined,
                                          size: 22, color: context.c.inkFaint),
                                    ),
                                  ),
                                ),
                              ),
                              if (photo.caption != null)
                                Padding(
                                  padding: const EdgeInsets.only(top: 3),
                                  child: Text(
                                    photo.caption!,
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                    style: TextStyle(fontSize: 10.5, color: context.c.inkFaint),
                                  ),
                                ),
                            ],
                          ))
                      .toList(),
                ),
              ],

              // العروض السارية (#184) — الخادم لا يرسل المنتهي ولا المطفأ.
              if (provider.offers.isNotEmpty) ...[
                const SizedBox(height: 20),
                _SectionTitle(title: 'عروض سارية', icon: Icons.local_offer_outlined),
                const SizedBox(height: 8),
                Column(
                  key: const Key('provider_offers_section'),
                  children: provider.offers
                      .map((offer) => Container(
                            key: Key('provider_offer_${offer.id}'),
                            margin: const EdgeInsets.only(bottom: 8),
                            padding: const EdgeInsets.all(11),
                            decoration: BoxDecoration(
                              color: context.c.surfaceSunk,
                              borderRadius: BorderRadius.circular(10),
                              border: Border.all(color: context.c.line),
                            ),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  offer.title,
                                  style: TextStyle(
                                    fontSize: 14,
                                    fontWeight: FontWeight.bold,
                                    color: context.c.ink,
                                  ),
                                ),
                                if (offer.description != null) ...[
                                  const SizedBox(height: 3),
                                  Text(
                                    offer.description!,
                                    style: TextStyle(fontSize: 12.5, color: context.c.inkSoft, height: 1.5),
                                  ),
                                ],
                                const SizedBox(height: 5),
                                Row(
                                  children: [
                                    if (offer.price != null) ...[
                                      Icon(Icons.sell_outlined, size: 14, color: context.c.gold),
                                      const SizedBox(width: 4),
                                      Text(
                                        '${offer.price} ₪',
                                        style: TextStyle(
                                          fontSize: 13,
                                          fontWeight: FontWeight.bold,
                                          color: context.c.gold,
                                        ),
                                      ),
                                      const SizedBox(width: 12),
                                    ],
                                    if (offer.endsAt != null) ...[
                                      Icon(Icons.schedule, size: 13, color: context.c.inkFaint),
                                      const SizedBox(width: 4),
                                      Text(
                                        'ينتهي ${offer.endsAt}',
                                        style: TextStyle(fontSize: 11.5, color: context.c.inkFaint),
                                      ),
                                    ],
                                  ],
                                ),
                              ],
                            ),
                          ))
                      .toList(),
                ),
              ],

              // المنتجات (#184) بسعر «تبدأ من».
              if (provider.products.isNotEmpty) ...[
                const SizedBox(height: 20),
                _SectionTitle(title: 'منتجاتنا', icon: Icons.inventory_2_outlined),
                const SizedBox(height: 8),
                Column(
                  key: const Key('provider_products_section'),
                  children: provider.products
                      .map((product) => Padding(
                            key: Key('provider_product_${product.id}'),
                            padding: const EdgeInsets.only(bottom: 10),
                            child: Row(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                if (product.imageUrl != null)
                                  ClipRRect(
                                    borderRadius: BorderRadius.circular(8),
                                    child: CachedNetworkImage(
                                      imageUrl: product.imageUrl!,
                                      width: 54,
                                      height: 54,
                                      fit: BoxFit.cover,
                                      errorWidget: (_, _, _) => Container(
                                        width: 54,
                                        height: 54,
                                        color: context.c.surfaceSunk,
                                      ),
                                    ),
                                  )
                                else
                                  Container(
                                    width: 54,
                                    height: 54,
                                    decoration: BoxDecoration(
                                      color: context.c.surfaceSunk,
                                      borderRadius: BorderRadius.circular(8),
                                    ),
                                    child: Icon(Icons.inventory_2_outlined,
                                        size: 22, color: context.c.inkFaint),
                                  ),
                                const SizedBox(width: 10),
                                Expanded(
                                  child: Column(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    children: [
                                      Text(
                                        product.name,
                                        style: TextStyle(
                                          fontSize: 13.5,
                                          fontWeight: FontWeight.bold,
                                          color: context.c.ink,
                                        ),
                                      ),
                                      if (product.description != null)
                                        Text(
                                          product.description!,
                                          style: TextStyle(
                                              fontSize: 12, color: context.c.inkSoft, height: 1.45),
                                        ),
                                      if (product.price != null)
                                        Text(
                                          'تبدأ من ${product.price} ₪',
                                          style: TextStyle(
                                            fontSize: 12.5,
                                            fontWeight: FontWeight.bold,
                                            color: context.c.gold,
                                          ),
                                        ),
                                    ],
                                  ),
                                ),
                              ],
                            ),
                          ))
                      .toList(),
                ),
              ],

              // تقييمات المزوّد (تذكرة #186): المتوسط والعدد، وتوزيع النجوم
              // خمسة أعمدة، ثم التعليقات المرقّمة. القسم يبقى ظاهراً بلا
              // تقييمات — هو موضع «اكتب تقييمك» ودعوة أول مقيِّم.
              const SizedBox(height: 20),
              Row(
                key: const Key('provider_reviews_section'),
                children: [
                  Expanded(
                    child: _SectionTitle(
                      title: 'التقييمات',
                      icon: Icons.star_outline,
                    ),
                  ),
                  TextButton.icon(
                    key: const Key('provider_write_review_btn'),
                    onPressed: _openReviewSheet,
                    icon: const Icon(Icons.rate_review_outlined, size: 18),
                    label: Text(_myReview == null ? 'اكتب تقييمك' : 'عدّل تقييمك'),
                  ),
                ],
              ),
              const SizedBox(height: 4),
              if (_ratingCount > 0) ...[
                Row(
                  key: const Key('provider_rating_summary'),
                  crossAxisAlignment: CrossAxisAlignment.baseline,
                  textBaseline: TextBaseline.alphabetic,
                  children: [
                    Text('★', style: TextStyle(fontSize: 18, color: context.c.gold)),
                    const SizedBox(width: 5),
                    Text(
                      _ratingAvg == null ? '—' : _ratingAvg!.toStringAsFixed(1),
                      key: const Key('provider_rating_avg'),
                      style: TextStyle(
                        fontSize: 20,
                        fontWeight: FontWeight.w900,
                        color: context.c.ink,
                      ),
                    ),
                    const SizedBox(width: 6),
                    Text(
                      '($_ratingCount تقييماً)',
                      key: const Key('provider_rating_count'),
                      style: TextStyle(fontSize: 12.5, color: context.c.inkFaint),
                    ),
                  ],
                ),
                const SizedBox(height: 10),
                Container(
                  key: const Key('provider_rating_distribution'),
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 8),
                  decoration: BoxDecoration(
                    color: context.c.surfaceSunk,
                    borderRadius: BorderRadius.circular(10),
                    border: Border.all(color: context.c.line),
                  ),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.end,
                    children: [
                      for (var stars = 5; stars >= 1; stars -= 1)
                        Expanded(child: _distributionColumn(stars)),
                    ],
                  ),
                ),
              ] else
                Text(
                  'لا تقييمات بعد — كن أول من يقيّم هذا المزوّد.',
                  key: const Key('provider_reviews_empty'),
                  style: TextStyle(fontSize: 12.5, color: context.c.inkFaint),
                ),
              // تقييم صاحبه أخفَته البلاغات: يبقى قابلاً للتعديل والحذف، ويُقال
              // له ذلك صراحةً بدل أن يظنّ أنه حُذف.
              if (_myReview != null && _myReview!.status == 'hidden')
                Padding(
                  padding: const EdgeInsets.only(top: 6),
                  child: Text(
                    'تقييمك مخفي بعد البلاغات — يمكنك تعديله أو حذفه.',
                    key: const Key('provider_review_hidden_note'),
                    style: TextStyle(fontSize: 12, color: context.c.gold),
                  ),
                ),
              const SizedBox(height: 10),
              for (final review in _reviews) _reviewTile(review),
              if (_reviewsFailed && _reviews.isEmpty)
                TextButton(
                  key: const Key('provider_reviews_retry'),
                  onPressed: _loadReviews,
                  child: const Text('تعذّر تحميل التعليقات — إعادة المحاولة'),
                ),
              if (_reviewsPage < _reviewsTotalPages)
                TextButton(
                  key: const Key('provider_reviews_more'),
                  onPressed: _loadingReviews ? null : () => _loadReviews(append: true),
                  child: const Text('المزيد من التعليقات'),
                ),

              // Flexible Capacity Notice
              const SizedBox(height: 16),
              // نفس سبب `ClipRRect` أعلاه: حدود بألوان مختلفة مع زوايا مستديرة.
              ClipRRect(
                borderRadius: BorderRadius.circular(10),
                child: Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: context.c.surfaceSunk,
                    border: Border(
                      right: BorderSide(color: context.c.gold, width: 3.5),
                      top: BorderSide(color: context.c.line),
                      left: BorderSide(color: context.c.line),
                      bottom: BorderSide(color: context.c.line),
                    ),
                  ),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Icon(Icons.info_outline, size: 18, color: context.c.gold),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              'توضيح مهم بشأن المواصفات والكميات:',
                              style: TextStyle(
                                fontSize: 12,
                                fontWeight: FontWeight.bold,
                                color: context.c.ink,
                              ),
                            ),
                            const SizedBox(height: 3),
                            Text(
                              'المواصفات والكميات الموضحة هنا تمثل حزمة استرشادية قياسية بهذا السعر كمثال لتقدير التكلفة. بإمكانك دائماً طلب كميات أكبر أو أصغر أو تعديل المواصفات بالاتفاق المباشر مع المزوّد لتناسب حجم مناسبتك تماماً.',
                              style: TextStyle(fontSize: 11.5, color: context.c.inkSoft, height: 1.45),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
              ),

              // Specs Grid
              if (provider.attributes.isNotEmpty) ...[
                const SizedBox(height: 16),
                Text(
                  'بنود ومواصفات هذه الحزمة النموذجية:',
                  style: TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.bold,
                    color: context.c.ink,
                  ),
                ),
                const SizedBox(height: 8),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: provider.attributes.map((attr) {
                    return Container(
                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
                      decoration: BoxDecoration(
                        color: context.c.surfaceSunk,
                        borderRadius: BorderRadius.circular(8),
                        border: Border.all(color: context.c.line),
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Text(
                            attr.label,
                            style: TextStyle(fontSize: 11, color: context.c.inkFaint),
                          ),
                          const SizedBox(height: 2),
                          Text(
                            attr.unit.isNotEmpty ? '${attr.value} ${attr.unit}' : attr.value,
                            style: TextStyle(
                              fontSize: 13.5,
                              fontWeight: FontWeight.bold,
                              color: context.c.ink,
                            ),
                          ),
                        ],
                      ),
                    );
                  }).toList(),
                ),
              ],

              const SizedBox(height: 24),
              if (!provider.hasPhone)
                Text(
                  'لا يوجد رقم تواصل مسجّل',
                  textAlign: TextAlign.center,
                  style: TextStyle(fontSize: 13, color: context.c.inkFaint),
                )
              else
                Row(
                  children: [
                    Expanded(
                      child: ElevatedButton.icon(
                        key: const Key('provider_whatsapp_btn'),
                        style: ElevatedButton.styleFrom(
                          backgroundColor: const Color(0xFF25D366),
                          foregroundColor: Colors.white,
                          padding: const EdgeInsets.symmetric(vertical: 13),
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                          elevation: 0,
                        ),
                        onPressed: widget.onWhatsApp,
                        icon: const Icon(Icons.chat, size: 18),
                        label: const Text(
                          'واتساب مباشر',
                          style: TextStyle(fontSize: 14, fontWeight: FontWeight.bold),
                        ),
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: ElevatedButton.icon(
                        style: ElevatedButton.styleFrom(
                          backgroundColor: context.c.sky,
                          foregroundColor: context.c.onSky,
                          padding: const EdgeInsets.symmetric(vertical: 13),
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                          elevation: 0,
                        ),
                        onPressed: widget.onCall,
                        icon: const Icon(Icons.phone_outlined, size: 18),
                        label: const Text(
                          'اتصال هاتفي',
                          style: TextStyle(fontSize: 14, fontWeight: FontWeight.bold),
                        ),
                      ),
                    ),
                  ],
                ),

              // مزوّدون مشابهون (#184) — حتى ستة، والنقر يفتح صفحة المزوّد.
              if (provider.similar.isNotEmpty) ...[
                const SizedBox(height: 24),
                _SectionTitle(title: 'مزوّدون مشابهون', icon: Icons.people_outline),
                const SizedBox(height: 8),
                SizedBox(
                  key: const Key('provider_similar_section'),
                  height: 132,
                  child: ListView.separated(
                    scrollDirection: Axis.horizontal,
                    itemCount: provider.similar.length,
                    separatorBuilder: (_, _) => const SizedBox(width: 8),
                    itemBuilder: (context, index) {
                      final candidate = provider.similar[index];
                      return InkWell(
                        key: Key('provider_similar_${candidate.id}'),
                        onTap: () => widget.onOpenSimilar(candidate),
                        borderRadius: BorderRadius.circular(10),
                        child: Container(
                          width: 116,
                          padding: const EdgeInsets.all(6),
                          decoration: BoxDecoration(
                            border: Border.all(color: context.c.line),
                            borderRadius: BorderRadius.circular(10),
                          ),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.stretch,
                            children: [
                              Expanded(
                                child: candidate.imageUrl != null
                                    ? ClipRRect(
                                        borderRadius: BorderRadius.circular(7),
                                        child: CachedNetworkImage(
                                          imageUrl: candidate.imageUrl!,
                                          fit: BoxFit.cover,
                                          errorWidget: (_, _, _) => Container(
                                            color: context.c.surfaceSunk,
                                          ),
                                        ),
                                      )
                                    : Container(
                                        decoration: BoxDecoration(
                                          color: context.c.surfaceSunk,
                                          borderRadius: BorderRadius.circular(7),
                                        ),
                                        child: Center(
                                          child: Text(
                                            candidate.categoryIcon.isNotEmpty
                                                ? candidate.categoryIcon
                                                : '🛠️',
                                            style: const TextStyle(fontSize: 22),
                                          ),
                                        ),
                                      ),
                              ),
                              const SizedBox(height: 4),
                              Text(
                                candidate.name,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: TextStyle(
                                  fontSize: 11.5,
                                  fontWeight: FontWeight.bold,
                                  color: context.c.ink,
                                ),
                              ),
                              Text(
                                candidate.towns.isNotEmpty
                                    ? candidate.towns.take(2).join('، ')
                                    : 'مناطق الخدمة غير محدَّدة',
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: TextStyle(fontSize: 10, color: context.c.inkFaint),
                              ),
                            ],
                          ),
                        ),
                      );
                    },
                  ),
                ),
              ],
            ],
          ),
        ),
      ],
    );
  }
}

/// غلاف الصفحة (#184): الغلاف إن وُجد، وإلا صورة المزوّد، وإلا التدرّج وأيقونة
/// الفئة. الشعار يُرسم في جسم الصفحة تحته (لا بموضع متراكب يغطّي ما بعده).
class _ProviderHeader extends StatelessWidget {
  const _ProviderHeader({required this.provider});

  final ServiceProviderDetail provider;

  @override
  Widget build(BuildContext context) {
    final banner = provider.coverUrl ?? provider.imageUrl;

    if (banner == null || banner.isEmpty) {
      return Container(
        height: 180,
        width: double.infinity,
        decoration: const BoxDecoration(
          gradient: RadialGradient(
            colors: [Color(0xFFFFFDF8), Color(0xFFFBF1D9), Color(0xFFF3DFAD)],
          ),
        ),
        child: Center(
          child: provider.categoryIcon.isNotEmpty
              ? Text(provider.categoryIcon, style: const TextStyle(fontSize: 48))
              : Icon(Icons.handyman_outlined, size: 48, color: context.c.gold),
        ),
      );
    }

    return CachedNetworkImage(
      key: const Key('provider_cover'),
      imageUrl: banner,
      height: 220,
      width: double.infinity,
      fit: BoxFit.cover,
      placeholder: (_, _) => Container(
        height: 220,
        color: context.c.surfaceSunk,
        child: const Center(child: CircularProgressIndicator(strokeWidth: 2)),
      ),
      errorWidget: (_, _, _) => Container(
        height: 220,
        color: context.c.surfaceSunk,
        child: Icon(Icons.image_not_supported_outlined, color: context.c.inkFaint, size: 38),
      ),
    );
  }
}

/// شارتا «موثّق» و«مميّز» — تظهران بما يرسله الخادم وحده.
class _ProviderBadges extends StatelessWidget {
  const _ProviderBadges({required this.provider});

  final ServiceProviderDetail provider;

  @override
  Widget build(BuildContext context) {
    return Wrap(
      key: const Key('provider_badges'),
      spacing: 6,
      runSpacing: 6,
      children: [
        if (provider.isVerified)
          _badge(
            context,
            key: const Key('provider_badge_verified'),
            label: 'موثّق',
            icon: Icons.verified_outlined,
            color: const Color(0xFF166534),
            background: const Color(0x2216A34A),
          ),
        if (provider.isFeatured)
          _badge(
            context,
            key: const Key('provider_badge_featured'),
            label: 'مميّز',
            icon: Icons.star_outline,
            color: const Color(0xFF8A6109),
            background: const Color(0x22B8860B),
          ),
      ],
    );
  }

  Widget _badge(
    BuildContext context, {
    required Key key,
    required String label,
    required IconData icon,
    required Color color,
    required Color background,
  }) {
    return Container(
      key: key,
      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 4),
      decoration: BoxDecoration(color: background, borderRadius: BorderRadius.circular(999)),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 14, color: color),
          const SizedBox(width: 4),
          Text(
            label,
            style: TextStyle(fontSize: 11.5, fontWeight: FontWeight.bold, color: color),
          ),
        ],
      ),
    );
  }
}

/// ورقة كتابة التقييم (تذكرة #186): نجوم 1..5، وتعليق اختياري، وإقرار أن
/// الرقم شخصي — يُرسل `confirm_phone: true`، ولا يُرسل التقييم دونه.
/// تُعبَّأ من تقييم صاحبه إن وُجد، فالتعديل يستبدل ولا يضيف تقييماً ثانياً.
class _ReviewSheet extends StatefulWidget {
  const _ReviewSheet({
    required this.initialReview,
    required this.onSubmit,
    this.onDelete,
  });

  final ProviderReview? initialReview;
  final Future<void> Function(int rating, String body, bool confirmPhone) onSubmit;
  final Future<void> Function()? onDelete;

  @override
  State<_ReviewSheet> createState() => _ReviewSheetState();
}

class _ReviewSheetState extends State<_ReviewSheet> {
  late int _rating = widget.initialReview?.rating ?? 0;
  late final TextEditingController _bodyController =
      TextEditingController(text: widget.initialReview?.body ?? '');
  bool _confirmPhone = false;
  bool _busy = false;

  @override
  void dispose() {
    _bodyController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (_rating < 1 || _rating > 5) {
      showMessage(context, 'اختر من نجمة إلى خمس نجوم أولاً', isError: true);
      return;
    }
    if (!_confirmPhone) {
      showMessage(context, 'أكّد أن رقمك شخصي قبل نشر التقييم', isError: true);
      return;
    }

    setState(() => _busy = true);
    try {
      await widget.onSubmit(_rating, _bodyController.text.trim(), _confirmPhone);
      if (mounted) Navigator.of(context).pop();
    } catch (error) {
      if (mounted) showMessage(context, '$error', isError: true);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _delete() async {
    final onDelete = widget.onDelete;
    if (onDelete == null) return;

    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('حذف تقييمي'),
        content: const Text('هل تحذف تقييمك عن هذا المزوّد؟'),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(false),
            child: const Text('إلغاء'),
          ),
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(true),
            child: const Text('احذف'),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;

    setState(() => _busy = true);
    try {
      await onDelete();
      if (mounted) Navigator.of(context).pop();
    } catch (error) {
      if (mounted) showMessage(context, '$error', isError: true);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(
        left: 16,
        right: 16,
        top: 8,
        bottom: MediaQuery.of(context).viewInsets.bottom + 16,
      ),
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              widget.initialReview == null ? 'اكتب تقييمك' : 'عدّل تقييمك',
              style: TextStyle(
                fontSize: 16,
                fontWeight: FontWeight.bold,
                color: context.c.ink,
              ),
            ),
            if (widget.initialReview?.status == 'hidden') ...[
              const SizedBox(height: 4),
              Text(
                'تقييمك مخفي بعد البلاغات — تعديله لا يعيد نشره.',
                style: TextStyle(fontSize: 11.5, color: context.c.gold),
              ),
            ],
            const SizedBox(height: 6),
            Row(
              key: const Key('provider_review_stars'),
              children: [
                for (var star = 1; star <= 5; star += 1)
                  IconButton(
                    key: Key('provider_review_star_$star'),
                    onPressed: _busy ? null : () => setState(() => _rating = star),
                    icon: Icon(star <= _rating ? Icons.star : Icons.star_border),
                    color: context.c.gold,
                    iconSize: 34,
                    tooltip: '$star',
                  ),
              ],
            ),
            TextField(
              key: const Key('provider_review_body'),
              controller: _bodyController,
              maxLines: 4,
              maxLength: 1000,
              decoration: const InputDecoration(
                hintText: 'كيف كانت تجربتك مع المزوّد؟ (اختياري)',
              ),
            ),
            CheckboxListTile(
              key: const Key('provider_review_confirm_phone'),
              value: _confirmPhone,
              onChanged: _busy
                  ? null
                  : (value) => setState(() => _confirmPhone = value == true),
              title: const Text('أؤكّد أن رقمي شخصي'),
              controlAffinity: ListTileControlAffinity.leading,
              contentPadding: EdgeInsets.zero,
            ),
            const SizedBox(height: 6),
            ElevatedButton(
              key: const Key('provider_review_submit'),
              onPressed: _busy ? null : _submit,
              child: const Text('نشر التقييم'),
            ),
            if (widget.onDelete != null) ...[
              const SizedBox(height: 4),
              TextButton(
                key: const Key('provider_review_delete'),
                onPressed: _busy ? null : _delete,
                child: const Text('حذف تقييمي'),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

/// ورقة «ردّك على التقييم» (تذكرة #187): نصّ واحد ≤1000 حرف، والحفظ يستبدل
/// الردّ القائم. تُعبَّأ من الردّ المخزَّن كي يكون التعديل تعديلاً لا كتابةً
/// من الصفر. والفراغ لا يُرسل: الخادم يرفضه 400 على أي حال.
class _ReplySheet extends StatefulWidget {
  const _ReplySheet({
    required this.initialReply,
    required this.onSubmit,
  });

  final String? initialReply;
  final Future<void> Function(String replyBody) onSubmit;

  @override
  State<_ReplySheet> createState() => _ReplySheetState();
}

class _ReplySheetState extends State<_ReplySheet> {
  late final TextEditingController _controller =
      TextEditingController(text: widget.initialReply ?? '');
  bool _busy = false;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final text = _controller.text.trim();
    if (text.isEmpty) {
      showMessage(context, 'اكتب نصّ الردّ أولاً', isError: true);
      return;
    }

    setState(() => _busy = true);
    try {
      await widget.onSubmit(text);
      if (mounted) Navigator.of(context).pop();
    } catch (error) {
      if (mounted) showMessage(context, '$error', isError: true);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final hasReply = (widget.initialReply ?? '').trim().isNotEmpty;
    return Padding(
      padding: EdgeInsets.only(
        left: 16,
        right: 16,
        top: 8,
        bottom: MediaQuery.of(context).viewInsets.bottom + 16,
      ),
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              hasReply ? 'عدّل ردّك على التقييم' : 'ردّك على التقييم',
              style: TextStyle(
                fontSize: 16,
                fontWeight: FontWeight.bold,
                color: context.c.ink,
              ),
            ),
            const SizedBox(height: 4),
            Text(
              'ردّ واحد لكل تقييم — يظهر تحت التقييم لكل من يفتح صفحتك.',
              style: TextStyle(fontSize: 11.5, color: context.c.inkFaint),
            ),
            const SizedBox(height: 8),
            TextField(
              key: const Key('provider_reply_body'),
              controller: _controller,
              maxLines: 4,
              maxLength: 1000,
              enabled: !_busy,
              decoration: const InputDecoration(
                hintText: 'مثال: شكراً لك — يسعدنا أن تجربتك كانت جيدة',
              ),
            ),
            const SizedBox(height: 6),
            ElevatedButton(
              key: const Key('provider_reply_submit'),
              onPressed: _busy ? null : _submit,
              child: const Text('حفظ الردّ'),
            ),
          ],
        ),
      ),
    );
  }
}

/// ورقة «اطلب عرض سعر» (تذكرة #188، ADR-0016): التاريخ المرغوب وعدد المعازيم
/// وملاحظة — ولا اختيار مناسبة في التطبيق (حقل `event_id` اختياري في الخادم،
/// وإرسال معرّف مناسبة لا يملكه الطالب يردّ 404؛ فلا يُخترع منتقٍ بلا مسار
/// يجلب مناسبات صاحب الحساب في هذه الشاشة). التاريخ نصّ `YYYY-MM-DD` يُفحص
/// هنا وفي الخادم (`requireDate`)، والفراغ يعني «لم يُذكر».
class _QuoteSheet extends StatefulWidget {
  const _QuoteSheet({required this.providerName, required this.onSubmit});

  final String providerName;
  final Future<void> Function({
    String? wantedDate,
    int? guestsCount,
    String? note,
  }) onSubmit;

  @override
  State<_QuoteSheet> createState() => _QuoteSheetState();
}

class _QuoteSheetState extends State<_QuoteSheet> {
  static final _datePattern = RegExp(r'^\d{4}-\d{2}-\d{2}$');

  final _dateController = TextEditingController();
  final _guestsController = TextEditingController();
  final _noteController = TextEditingController();
  bool _busy = false;

  @override
  void dispose() {
    _dateController.dispose();
    _guestsController.dispose();
    _noteController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final dateText = _dateController.text.trim();
    if (dateText.isNotEmpty && !_datePattern.hasMatch(dateText)) {
      showMessage(context, 'التاريخ بصيغة YYYY-MM-DD', isError: true);
      return;
    }

    final guestsText = _guestsController.text.trim();
    int? guests;
    if (guestsText.isNotEmpty) {
      guests = int.tryParse(guestsText);
      if (guests == null || guests < 1) {
        showMessage(context, 'عدد المعازيم عددٌ صحيح أكبر من صفر', isError: true);
        return;
      }
    }

    final note = _noteController.text.trim();
    setState(() => _busy = true);
    try {
      await widget.onSubmit(
        wantedDate: dateText.isEmpty ? null : dateText,
        guestsCount: guests,
        note: note.isEmpty ? null : note,
      );
      if (mounted) Navigator.of(context).pop();
    } catch (error) {
      if (mounted) {
        showMessage(
          context,
          error is ApiException ? error.message : '$error',
          isError: true,
        );
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(
        left: 16,
        right: 16,
        top: 8,
        bottom: MediaQuery.of(context).viewInsets.bottom + 16,
      ),
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              'اطلب عرض سعر',
              style: TextStyle(
                fontSize: 16,
                fontWeight: FontWeight.bold,
                color: context.c.ink,
              ),
            ),
            const SizedBox(height: 4),
            Text(
              'أرسل تفاصيل مناسبتك إلى «${widget.providerName}» ليصلك عرضه.',
              style: TextStyle(fontSize: 11.5, color: context.c.inkFaint),
            ),
            const SizedBox(height: 10),
            TextField(
              key: const Key('quote_request_date'),
              controller: _dateController,
              enabled: !_busy,
              keyboardType: TextInputType.datetime,
              decoration: const InputDecoration(
                labelText: 'التاريخ المرغوب (اختياري)',
                hintText: 'YYYY-MM-DD',
              ),
            ),
            const SizedBox(height: 10),
            TextField(
              key: const Key('quote_request_guests'),
              controller: _guestsController,
              enabled: !_busy,
              keyboardType: TextInputType.number,
              decoration: const InputDecoration(
                labelText: 'عدد المعازيم (اختياري)',
              ),
            ),
            const SizedBox(height: 10),
            TextField(
              key: const Key('quote_request_note'),
              controller: _noteController,
              enabled: !_busy,
              maxLines: 3,
              maxLength: 1000,
              decoration: const InputDecoration(
                labelText: 'ملاحظة (اختياري)',
                hintText: 'مثال: عرس في قاعة، ويشمل الكراسي والضيافة',
                counterText: '',
              ),
            ),
            const SizedBox(height: 6),
            ElevatedButton(
              key: const Key('quote_request_submit'),
              onPressed: _busy ? null : _submit,
              style: ElevatedButton.styleFrom(
                minimumSize: const Size.fromHeight(44),
              ),
              child: const Text('إرسال الطلب'),
            ),
          ],
        ),
      ),
    );
  }
}

/// عنوان قسم داخل الصفحة — واحد لكل أقسامها (#184)، فلا ثلاثة أنماط عنوان.
class _SectionTitle extends StatelessWidget {
  const _SectionTitle({required this.title, required this.icon});

  final String title;
  final IconData icon;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Icon(icon, size: 17, color: context.c.gold),
        const SizedBox(width: 7),
        Text(
          title,
          style: TextStyle(fontSize: 14, fontWeight: FontWeight.bold, color: context.c.ink),
        ),
      ],
    );
  }
}
