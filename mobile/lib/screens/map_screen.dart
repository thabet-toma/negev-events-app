import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';
import 'package:url_launcher/url_launcher.dart';

import '../main.dart';
import '../models/event.dart';
import '../theme.dart';
import '../widgets/async_view.dart';
import 'event_details_screen.dart';

/// خريطة المناسبات — نفس نقاط GET /api/map/events التي تعرضها واجهة الويب.
class MapScreen extends StatefulWidget {
  const MapScreen({super.key});

  @override
  State<MapScreen> createState() => _MapScreenState();
}

class _MapScreenState extends State<MapScreen> {
  /// مركز النقب تقريباً — نقطة البداية قبل ضبط الحدود على النقاط.
  static const _negevCenter = LatLng(31.2800, 34.8800);

  Future<List<MapPoint>>? _points;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _points ??= AppServices.of(context).api.mapPoints();
  }

  void _refresh() {
    setState(() => _points = AppServices.of(context).api.mapPoints());
  }

  Future<void> _navigate(MapPoint point) async {
    final url = point.wazeUrl ??
        'https://waze.com/ul?ll=${point.latitude},${point.longitude}&navigate=yes';
    if (!await launchUrl(
      Uri.parse(url),
      mode: LaunchMode.externalApplication,
    )) {
      if (mounted) showMessage(context, 'تعذّر فتح Waze', isError: true);
    }
  }

  void _showPoint(MapPoint point) {
    showModalBottomSheet<void>(
      context: context,
      backgroundColor: context.c.surfaceSunk,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(22)),
      ),
      builder: (sheetContext) => Padding(
        padding: const EdgeInsets.fromLTRB(20, 20, 20, 28),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              point.displayTitle,
              style: TextStyle(
                fontSize: 17,
                fontWeight: FontWeight.bold,
                color: sheetContext.c.ink,
              ),
            ),
            const SizedBox(height: 10),
            Text(
              '${point.town} — ${point.locationName}',
              style: TextStyle(color: sheetContext.c.inkSoft),
            ),
            const SizedBox(height: 6),
            Text(
              point.eventDate,
              style: TextStyle(color: sheetContext.c.inkFaint, fontSize: 13),
            ),
            const SizedBox(height: 18),
            Row(
              children: [
                Expanded(
                  child: OutlinedButton.icon(
                    onPressed: () {
                      Navigator.of(sheetContext).pop();
                      Navigator.of(context).push(
                        MaterialPageRoute(
                          builder: (_) =>
                              EventDetailsScreen(eventId: point.id),
                        ),
                      );
                    },
                    icon: const Icon(Icons.info_outline),
                    label: const Text('التفاصيل'),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: ElevatedButton.icon(
                    onPressed: () {
                      Navigator.of(sheetContext).pop();
                      _navigate(point);
                    },
                    icon: const Icon(Icons.navigation_outlined),
                    label: const Text('Waze'),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('خريطة المناسبات'),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            tooltip: 'تحديث',
            onPressed: _refresh,
          ),
        ],
      ),
      body: FutureBuilder<List<MapPoint>>(
        future: _points,
        builder: (context, snapshot) {
          return AsyncView<List<MapPoint>>(
            snapshot: snapshot,
            onRetry: _refresh,
            isEmpty: (data) => data.isEmpty,
            emptyMessage: 'لا توجد مناسبات بإحداثيات على الخريطة',
            builder: (points) => FlutterMap(
              options: MapOptions(
                initialCenter: points.isEmpty
                    ? _negevCenter
                    : LatLng(points.first.latitude, points.first.longitude),
                initialZoom: 10.5,
                minZoom: 6,
                maxZoom: 18,
              ),
              children: [
                TileLayer(
                  urlTemplate:
                      'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
                  userAgentPackageName: 'com.negev.negev_events',
                ),
                MarkerLayer(
                  markers: points
                      .map(
                        (point) => Marker(
                          point: LatLng(point.latitude, point.longitude),
                          width: 44,
                          height: 44,
                          child: GestureDetector(
                            onTap: () => _showPoint(point),
                            child: Container(
                              decoration: BoxDecoration(
                                color: context.c.sky,
                                shape: BoxShape.circle,
                                border: Border.all(
                                  color: context.c.onSky,
                                  width: 2,
                                ),
                              ),
                              child: Icon(
                                Icons.celebration,
                                size: 22,
                                color: context.c.onSky,
                              ),
                            ),
                          ),
                        ),
                      )
                      .toList(),
                ),
              ],
            ),
          );
        },
      ),
    );
  }
}
