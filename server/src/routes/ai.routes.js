'use strict';

/**
 * Assistant endpoints for the composer screen.
 *
 * NOTE: both endpoints are local, offline helpers — the poem generator picks
 * from curated Nabati templates and the card scanner returns demo data. They
 * call no external model. Responses carry `simulated: true` so the UI can
 * label them honestly.
 */

const express = require('express');
const { cleanString } = require('../middleware/validate');
const { TOWNS } = require('../constants');

const router = express.Router();

function buildPoems(groom, clan, town) {
  return [
    {
      verse1: `يا هلا باللي لفا حفل النشامى من بعيد *** في فرح ${groom} نسل الكرام الأجاويد`,
      verse2: `ديار ${clan} عامرة بالعز والمجد التليد *** عسى السعادة فالكم في كل يومٍ وعيد`,
      category: 'شيلة فخر وترحيب بدوي'
    },
    {
      verse1: `مبروك يا ${groom} عسى أيامك هنية وسرور *** يا زينة الفرسان في ليلة بها البدر منور`,
      verse2: `تزهى بك العرضة وتفرح بك ربوع ${town} والدور *** والله يتمم فرحتكم بالمسرة والنور`,
      category: 'سامر ودحة نبطية'
    },
    {
      verse1: `بارك الله للعروسين في ليلة الوفا والجود *** واجعل منازلكم عامرة بالهنا والعود`,
      verse2: `تهنئة من القلب لـ ${clan} ذرى كل مضهود *** عساكم دوم في أعياد وفرح ما له حدود`,
      category: 'تبريكة مباركة كلاسيكية'
    }
  ];
}

router.post('/ai/generate-poem', (req, res) => {
  const groom = cleanString(req.body.groom_name, 150) || 'العريس الغالي';
  const clan = cleanString(req.body.clan, 150) || 'النشامى';
  const town = cleanString(req.body.town, 100) || 'النقب';

  const poems = buildPoems(groom, clan, town);
  const poem = poems[Math.floor(Math.random() * poems.length)];

  res.json({ success: true, simulated: true, poem });
});

router.post('/ai/scan-card', (req, res) => {
  const town = TOWNS[Math.floor(Math.random() * (TOWNS.length - 1))];
  const inTwoWeeks = new Date(Date.now() + 86400000 * 14).toISOString().split('T')[0];

  res.json({
    success: true,
    simulated: true,
    message: 'بيانات تجريبية للعرض — لم يتم تحليل صورة فعلية',
    extracted: {
      groom_name: 'سالم عودة النعامي',
      family_clan: 'آل النعامي',
      town,
      event_date: inTwoWeeks,
      dinner_time: 'الساعة 8:00 مساءً',
      location_name: `ديوان آل النعامي - ${town} بالقرب من الميدان الرئيسي`
    }
  });
});

module.exports = router;
