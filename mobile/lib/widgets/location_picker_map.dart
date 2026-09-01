import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:geolocator/geolocator.dart';
import 'package:latlong2/latlong.dart';

import '../api/negev_api.dart';
import '../theme.dart';
import 'async_view.dart';

/// مركز عام يغطي النقب كلها — يُستعمل فقط حين لا مركز معروف للبلدة المختارة
/// (مثال: 'القرى والتجمعات' ليست مكاناً بل سلّة تجميع، فلا مدخل لها في
/// `townCoordinates`). ليس تخميناً لمركز بعينه بل إطار عام.
const LatLng _negevFallbackCenter = LatLng(31.2800, 34.8800);
const double _negevFallbackZoom = 9;
const double _townZoom = 14;

/// منتقي موقع القاعة على الخريطة — بديل حقلَي إحداثيات يدويين.
///
/// يفتح على مركز البلدة المختارة (من `townCoordinates` القادمة من الخادم)،
/// والمستخدم ينقر على الخريطة لوضع الدبّوس. بلا نقر لا إحداثيات تُرسَل أبداً:
/// الخادم يقع حينها على مركز البلدة نفسه، فدبّوس غائب أصدق من قيمة مصطنعة.
class LocationPickerMap extends StatefulWidget {
  const LocationPickerMap({
    super.key,
    required this.town,
    required this.townCoordinates,
    required this.onChanged,
  });

  final String town;
  final Map<String, TownCoordinate> townCoordinates;

  /// يُستدعى بالإحداثيات المختارة عند كل نقرة على الخريطة، وبـ`null` حين
  /// يمسح المستخدم تحديده فيعود الحقل إلى الغياب التامّ.
  final void Function(double? latitude, double? longitude) onChanged;

  @override
  State<LocationPickerMap> createState() => _LocationPickerMapState();
}

class _LocationPickerMapState extends State<LocationPickerMap> {
  final _mapController = MapController();
  LatLng? _pin;
  bool _pinPlacedByUser = false;
  bool _locating = false;

  bool get _hasKnownCenter => widget.townCoordinates.containsKey(widget.town);

  LatLng _resolvedCenter(String town, Map<String, TownCoordinate> coords) {
    final coord = coords[town];
    return coord == null ? _negevFallbackCenter : LatLng(coord.lat, coord.lng);
  }

  @override
  void didUpdateWidget(covariant LocationPickerMap oldWidget) {
    super.didUpdateWidget(oldWidget);
    // تغيير البلدة (أو وصول إحداثياتها متأخّراً من الخادم) يعيد التوسيط على
    // مركزها — إلا إن كان المستخدم قد وضع دبّوساً بنفسه فعلاً، فنُبقي دبّوسه
    // وموضع الخريطة كما هما ولا نزيحهما من تحته.
    if (_pinPlacedByUser) return;
    final oldCenter = _resolvedCenter(oldWidget.town, oldWidget.townCoordinates);
    final newCenter = _resolvedCenter(widget.town, widget.townCoordinates);
    if (oldCenter != newCenter) {
      _mapController.move(newCenter, _hasKnownCenter ? _townZoom : _negevFallbackZoom);
    }
  }

  void _setPin(LatLng point) {
    setState(() {
      _pin = point;
      _pinPlacedByUser = true;
    });
    widget.onChanged(point.latitude, point.longitude);
  }

  /// نقرة واحدة بالخطأ كانت تفرض إحداثية لا رجعة عنها على حقل اختياري —
  /// المسح يعيد الحالة إلى «بلا دبّوس»، وهي أصدق من نقطة لم يقصدها أحد.
  void _clearPin() {
    setState(() {
      _pin = null;
      _pinPlacedByUser = false;
    });
    widget.onChanged(null, null);
  }

  Future<void> _locateMe() async {
    setState(() => _locating = true);
    try {
      if (!await Geolocator.isLocationServiceEnabled()) {
        if (mounted) {
          showMessage(context, 'خدمة الموقع مطفأة على جهازك', isError: true);
        }
        await Geolocator.openLocationSettings();
        return;
      }

      var permission = await Geolocator.checkPermission();
      if (permission == LocationPermission.denied) {
        permission = await Geolocator.requestPermission();
      }

      if (permission == LocationPermission.denied) {
        if (mounted) {
          showMessage(
            context,
            'تم رفض إذن الموقع — يمكنك المحاولة مرة أخرى',
            isError: true,
          );
        }
        return;
      }

      if (permission == LocationPermission.deniedForever) {
        if (mounted) {
          showMessage(
            context,
            'إذن الموقع مرفوض بشكل دائم — افتح إعدادات التطبيق لتفعيله',
            isError: true,
          );
        }
        await Geolocator.openAppSettings();
        return;
      }

      // لا يوسّط إلا الخريطة — الدبّوس والقيمة المرسَلة لا يتغيّران هنا إطلاقاً،
      // فموقع الجهاز لا يصل الخادم أبداً بهذا المسار.
      final position = await Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(
          accuracy: LocationAccuracy.high,
          timeLimit: Duration(seconds: 15),
        ),
      );

      if (!mounted) return;
      _mapController.move(LatLng(position.latitude, position.longitude), _townZoom);
    } on TimeoutException {
      if (mounted) {
        showMessage(context, 'انتهت مهلة تحديد الموقع — حاول مرة أخرى', isError: true);
      }
    } catch (_) {
      if (mounted) {
        showMessage(context, 'تعذّر تحديد موقعك الحالي', isError: true);
      }
    } finally {
      if (mounted) setState(() => _locating = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            const Expanded(
              child: Text(
                'موقع القاعة على الخريطة (اختياري)',
                style: TextStyle(color: AppTheme.textSecondary, fontSize: 13),
              ),
            ),
            if (_pin != null)
              TextButton.icon(
                onPressed: _clearPin,
                icon: const Icon(Icons.close, size: 18),
                label: const Text('مسح التحديد'),
              ),
            TextButton.icon(
              onPressed: _locating ? null : _locateMe,
              icon: _locating
                  ? const SizedBox(
                      width: 14,
                      height: 14,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Icon(Icons.my_location, size: 18),
              label: const Text('موقعي الآن'),
            ),
          ],
        ),
        if (!_hasKnownCenter)
          const Padding(
            padding: EdgeInsets.only(bottom: 8),
            child: Text(
              'هذه المجموعة بلا مركز واحد على الخريطة — الرجاء تحديد موقع '
              'القاعة يدوياً بالنقر عليه',
              style: TextStyle(color: AppTheme.textMuted, fontSize: 12.5),
            ),
          ),
        ClipRRect(
          borderRadius: BorderRadius.circular(14),
          child: SizedBox(
            height: 220,
            child: FlutterMap(
              mapController: _mapController,
              options: MapOptions(
                initialCenter: _resolvedCenter(widget.town, widget.townCoordinates),
                initialZoom: _hasKnownCenter ? _townZoom : _negevFallbackZoom,
                minZoom: 6,
                maxZoom: 18,
                onTap: (_, point) => _setPin(point),
              ),
              children: [
                TileLayer(
                  urlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
                  userAgentPackageName: 'com.negev.negev_events',
                ),
                if (_pin != null)
                  MarkerLayer(
                    markers: [
                      Marker(
                        point: _pin!,
                        width: 40,
                        height: 40,
                        child: const Icon(
                          Icons.location_on,
                          color: AppTheme.gold,
                          size: 38,
                        ),
                      ),
                    ],
                  ),
              ],
            ),
          ),
        ),
      ],
    );
  }
}
