'use strict';

/** Recognised Negev towns, in the order the UI presents them. */
const TOWNS = [
  'رهط',
  'حورة',
  'تل السبع',
  'كسيفة',
  'شقيب السلام',
  'اللقية',
  'عرعرة النقب',
  'القرى والتجمعات'
];

/** Fallback map coordinates used when an event has no explicit location. */
const TOWN_COORDINATES = {
  'رهط': { lat: 31.3925, lng: 34.7554 },
  'حورة': { lat: 31.2858, lng: 34.9312 },
  'تل السبع': { lat: 31.2483, lng: 34.8431 },
  'كسيفة': { lat: 31.2980, lng: 35.0310 },
  'شقيب السلام': { lat: 31.2062, lng: 34.8210 },
  'اللقية': { lat: 31.3260, lng: 34.8720 },
  'عرعرة النقب': { lat: 31.1890, lng: 35.0120 },
  'القرى والتجمعات': { lat: 31.2600, lng: 34.8800 }
};

const REACTION_TYPES = ['coffee', 'horse', 'fireworks', 'rose', 'hand'];

const EVENT_STATUSES = ['pending', 'approved', 'rejected'];

const DEFAULT_POSTER =
  'https://images.unsplash.com/photo-1519741497674-611481863552?w=800&auto=format&fit=crop&q=80';

module.exports = { TOWNS, TOWN_COORDINATES, REACTION_TYPES, EVENT_STATUSES, DEFAULT_POSTER };
