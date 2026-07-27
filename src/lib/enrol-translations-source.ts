/**
 * Server-side source dictionary for enrolment-form translations.
 *
 * 2026-07-27: Phase 2 pt 2 — AI-generated translations for the wizard
 * shell (progress bar, buttons, banners, intro screen). These live in
 * code so they ship with a deploy; the `EnrolFormTranslation` DB table
 * overrides on a per-(key, locale) basis when staff edits via
 * `/settings/enrol-translations` (Phase 3).
 *
 * Non-English translations are AI-generated with the intent to be
 * reviewed by native-speaking staff. The intro screen shows a
 * "preview language" disclaimer to set that expectation for parents.
 *
 * Keep keys in sync with `ENROL_STRINGS_EN` in `enrol-i18n.ts`.
 */

export type LocaleDict = Record<string, string>;

export const ENROL_TRANSLATIONS_SOURCE: Record<string, LocaleDict> = {
  ar: {
    "wizard.step.children": "تفاصيل الطفل",
    "wizard.step.parents": "الوالد / ولي الأمر",
    "wizard.step.medical": "الطبية",
    "wizard.step.emergency": "جهات اتصال الطوارئ",
    "wizard.step.consents": "الموافقات",
    "wizard.step.booking": "الحجز",
    "wizard.step.payment": "الدفع",
    "wizard.step.review": "مراجعة وإرسال",
    "wizard.button.back": "رجوع",
    "wizard.button.next": "التالي",
    "wizard.button.submit": "إرسال التسجيل",
    "wizard.button.submitting": "جارٍ الإرسال…",
    "wizard.button.startOver": "إعادة البدء",
    "wizard.button.resume": "متابعة",
    "wizard.button.discard": "تجاهل والبدء من جديد",
    "wizard.banner.translationPreview":
      "الترجمة قادمة قريبًا. يعرض النموذج حاليًا باللغة الإنجليزية. إذا كان هناك أي شيء غير واضح، تواصلوا معنا عبر enrolments@amanaoshc.com.au.",
    "wizard.banner.savedProgress":
      "لقد حفظنا تقدمك في هذا المتصفح. هل تريد المتابعة من حيث توقفت؟",
    "wizard.error.title": "الرجاء تصحيح ما يلي قبل المتابعة:",
    "wizard.submitError.title": "لم نتمكن من إرسال طلب التسجيل",
    "wizard.success.title": "تم استلام التسجيل",
    "wizard.success.subtitle":
      "شكرًا لك — لقد استلمنا طلب تسجيل {childNames}. سيتواصل معك فريقنا قريبًا.",
    "intro.brand": "أمانة OSHC",
    "intro.heading": "أهلاً بك",
    "intro.subheading":
      "قبل أن نبدأ تسجيل طفلك، من فضلك اختر لغتك المفضلة.",
    "intro.language.label": "اللغة المفضلة",
    "intro.language.preview": "معاينة",
    "intro.language.disclaimer":
      "لغة معاينة. سيظهر النموذج باللغة الإنجليزية بينما ننهي ترجمة {language}. إذا كان هناك أي شيء غير واضح، تواصلوا معنا عبر enrolments@amanaoshc.com.au.",
    "intro.button.continue": "متابعة",
    "intro.footer.saveHint":
      "يتم حفظ تقدمك في هذا المتصفح أثناء التنقل — يمكنك إغلاق هذا التبويب والإكمال لاحقًا.",
  },

  ur: {
    "wizard.step.children": "بچے کی تفصیلات",
    "wizard.step.parents": "والدین / سرپرست",
    "wizard.step.medical": "طبی",
    "wizard.step.emergency": "ہنگامی رابطے",
    "wizard.step.consents": "رضامندی",
    "wizard.step.booking": "بکنگ",
    "wizard.step.payment": "ادائیگی",
    "wizard.step.review": "جائزہ لیں اور جمع کروائیں",
    "wizard.button.back": "واپس",
    "wizard.button.next": "اگلا",
    "wizard.button.submit": "داخلہ جمع کروائیں",
    "wizard.button.submitting": "جمع کیا جا رہا ہے…",
    "wizard.button.startOver": "دوبارہ شروع کریں",
    "wizard.button.resume": "جاری رکھیں",
    "wizard.button.discard": "مسترد کریں اور نئے سرے سے شروع کریں",
    "wizard.banner.translationPreview":
      "ترجمہ جلد آ رہا ہے۔ فارم فی الحال انگریزی میں دکھایا جا رہا ہے۔ اگر کچھ واضح نہ ہو تو ہم سے enrolments@amanaoshc.com.au پر رابطہ کریں۔",
    "wizard.banner.savedProgress":
      "ہم نے اس براؤزر میں آپ کی پیش رفت محفوظ کر لی ہے۔ کیا آپ جہاں چھوڑا تھا وہاں سے جاری رکھنا چاہتے ہیں؟",
    "wizard.error.title": "براہ کرم جاری رکھنے سے پہلے درج ذیل کو درست کریں:",
    "wizard.submitError.title": "ہم آپ کا داخلہ جمع نہیں کر سکے",
    "wizard.success.title": "داخلہ موصول ہو گیا",
    "wizard.success.subtitle":
      "شکریہ — ہمیں {childNames} کا داخلہ موصول ہو گیا۔ ہماری ٹیم جلد آپ سے رابطہ کرے گی۔",
    "intro.brand": "امانا OSHC",
    "intro.heading": "خوش آمدید",
    "intro.subheading":
      "اپنے بچے کا داخلہ شروع کرنے سے پہلے، براہ کرم اپنی ترجیحی زبان منتخب کریں۔",
    "intro.language.label": "ترجیحی زبان",
    "intro.language.preview": "پیش نظارہ",
    "intro.language.disclaimer":
      "پیش نظارہ زبان۔ جب تک ہم {language} کا ترجمہ مکمل کرتے ہیں، فارم انگریزی میں دکھایا جائے گا۔ اگر کچھ واضح نہ ہو تو ہم سے enrolments@amanaoshc.com.au پر رابطہ کریں۔",
    "intro.button.continue": "جاری رکھیں",
    "intro.footer.saveHint":
      "آپ کی پیش رفت اس براؤزر میں محفوظ ہوتی رہتی ہے — آپ یہ ٹیب بند کر کے بعد میں مکمل کر سکتے ہیں۔",
  },

  so: {
    "wizard.step.children": "Faahfaahinta Ilmaha",
    "wizard.step.parents": "Waalidka / Masuulka",
    "wizard.step.medical": "Caafimaadka",
    "wizard.step.emergency": "Xiriirinta Degdegga",
    "wizard.step.consents": "Ogolaanshaha",
    "wizard.step.booking": "Buugista",
    "wizard.step.payment": "Bixinta",
    "wizard.step.review": "Dib u eeg oo Gudbi",
    "wizard.button.back": "Dib",
    "wizard.button.next": "Xiga",
    "wizard.button.submit": "Gudbi diiwaangelinta",
    "wizard.button.submitting": "Waa la gudbinayaa…",
    "wizard.button.startOver": "Ka bilow",
    "wizard.button.resume": "Sii wad",
    "wizard.button.discard": "Iska tuur oo ku bilow cusub",
    "wizard.banner.translationPreview":
      "turjumaad soo socota. Foomka wuxuu hadda ku muuqanayaa Ingiriisi. Haddii ay wax kula muuqato oo aan cad ahayn, nagala soo xiriir enrolments@amanaoshc.com.au.",
    "wizard.banner.savedProgress":
      "Waxaan ku kaydinnay horumarkaaga browser-kan. Ma rabtaa inaad ka sii wado meeshaad joogsatay?",
    "wizard.error.title": "Fadlan sax kuwan soo socda ka hor intaadan sii wadin:",
    "wizard.submitError.title": "Ma awoodnay inaan diiwaangelinta gudbino",
    "wizard.success.title": "Diiwaangelinta waa la helay",
    "wizard.success.subtitle":
      "Mahadsanid — waxaan helnay diiwaangelinta {childNames}. Kooxdayadu wax yar gudahood ayay kula soo xiriiri doonaan.",
    "intro.brand": "Amana OSHC",
    "intro.heading": "Soo Dhawoow",
    "intro.subheading":
      "Ka hor inta aynaan bilaabin diiwaangelinta ilmahaaga, fadlan dooro luqadda aad doorbidayso.",
    "intro.language.label": "Luqadda aad doorbidayso",
    "intro.language.preview": "Muuqaal hore",
    "intro.language.disclaimer":
      "Luqad muuqaal hore. Foomku wuxuu ku muuqan doonaa Ingiriisi inta aynu dhamaystirayno turjumaadda {language}. Haddii ay wax kula muuqato oo aan cad ahayn, nagala soo xiriir enrolments@amanaoshc.com.au.",
    "intro.button.continue": "Sii wad",
    "intro.footer.saveHint":
      "Horumarkaaga waa lagu keydiyaa browser-kan inta aad wado — waad xidhi kartaa taabkan oo dib u soo laaban kartaa.",
  },

  ps: {
    "wizard.step.children": "د ماشوم توضیحات",
    "wizard.step.parents": "مور/پلار / سرپرست",
    "wizard.step.medical": "طبي",
    "wizard.step.emergency": "د بیړني اړیکې",
    "wizard.step.consents": "موافقې",
    "wizard.step.booking": "بکنګ",
    "wizard.step.payment": "تادیه",
    "wizard.step.review": "کتنه او سپارل",
    "wizard.button.back": "شاته",
    "wizard.button.next": "راتلونکی",
    "wizard.button.submit": "د راجستر سپارل",
    "wizard.button.submitting": "سپارل کیږي…",
    "wizard.button.startOver": "بیا پیل کول",
    "wizard.button.resume": "دوام",
    "wizard.button.discard": "لغوه او نوی پیل کول",
    "wizard.banner.translationPreview":
      "ژباړه ژر راځي. فورمه اوس په انګلیسي کې ښکاري. که چیرې کوم شی روښانه نه وي، له مونږ سره د enrolments@amanaoshc.com.au له لارې اړیکه ونیسئ.",
    "wizard.banner.savedProgress":
      "مونږ ستاسو پرمختګ په دې براوزر کې خوندي کړی. آیا غواړئ له هغه ځایه چې پرېښود دوام ورکړئ؟",
    "wizard.error.title": "مهرباني وکړئ د دوام لپاره لاندې تصحیح کړئ:",
    "wizard.submitError.title": "مونږ ستاسو د راجستریشن سپارلو کې پاتې راغلو",
    "wizard.success.title": "راجستر ترلاسه شو",
    "wizard.success.subtitle":
      "مننه — مونږ د {childNames} راجستر ترلاسه کړ. زموږ ټیم به ژر تاسو سره اړیکه ونیسي.",
    "intro.brand": "امانا OSHC",
    "intro.heading": "ښه راغلاست",
    "intro.subheading":
      "مخکې له دې چې د ستاسو ماشوم راجستریشن پیل کړو، مهرباني وکړئ خپله غوره ژبه وټاکئ.",
    "intro.language.label": "غوره ژبه",
    "intro.language.preview": "مخکتنه",
    "intro.language.disclaimer":
      "د مخکتنې ژبه. تر څو مونږ د {language} ژباړه بشپړوو، فورمه به په انګلیسي کې ښکاري. که چیرې کوم شی روښانه نه وي، له مونږ سره د enrolments@amanaoshc.com.au له لارې اړیکه ونیسئ.",
    "intro.button.continue": "دوام ورکړئ",
    "intro.footer.saveHint":
      "ستاسو پرمختګ په دې براوزر کې خوندي کیږي — تاسو کولی شئ دا ټب وتړئ او وروسته یې بشپړ کړئ.",
  },

  tr: {
    "wizard.step.children": "Çocuk Bilgileri",
    "wizard.step.parents": "Ebeveyn / Veli",
    "wizard.step.medical": "Sağlık",
    "wizard.step.emergency": "Acil Durum Kişileri",
    "wizard.step.consents": "İzinler",
    "wizard.step.booking": "Rezervasyon",
    "wizard.step.payment": "Ödeme",
    "wizard.step.review": "Gözden Geçir ve Gönder",
    "wizard.button.back": "Geri",
    "wizard.button.next": "İleri",
    "wizard.button.submit": "Kaydı Gönder",
    "wizard.button.submitting": "Gönderiliyor…",
    "wizard.button.startOver": "Baştan başla",
    "wizard.button.resume": "Devam et",
    "wizard.button.discard": "İptal edip baştan başla",
    "wizard.banner.translationPreview":
      "çevirisi yakında geliyor. Form şu anda İngilizce olarak gösteriliyor. Bir şey anlaşılır değilse, bize enrolments@amanaoshc.com.au adresinden ulaşın.",
    "wizard.banner.savedProgress":
      "İlerlemenizi bu tarayıcıda kaydettik. Kaldığınız yerden devam etmek ister misiniz?",
    "wizard.error.title": "Devam etmeden önce lütfen aşağıdakileri düzeltin:",
    "wizard.submitError.title": "Kayıt gönderiminiz tamamlanamadı",
    "wizard.success.title": "Kayıt alındı",
    "wizard.success.subtitle":
      "Teşekkür ederiz — {childNames} için kaydınızı aldık. Ekibimiz kısa süre içinde sizinle iletişime geçecek.",
    "intro.brand": "Amana OSHC",
    "intro.heading": "Hoş geldiniz",
    "intro.subheading":
      "Çocuğunuzun kaydına başlamadan önce, lütfen tercih ettiğiniz dili seçin.",
    "intro.language.label": "Tercih edilen dil",
    "intro.language.preview": "Önizleme",
    "intro.language.disclaimer":
      "Önizleme dili. {language} çevirisini tamamlayana kadar form İngilizce olarak gösterilecek. Bir şey anlaşılır değilse, bize enrolments@amanaoshc.com.au adresinden ulaşın.",
    "intro.button.continue": "Devam et",
    "intro.footer.saveHint":
      "İlerlemeniz bu tarayıcıda otomatik olarak kaydedilir — bu sekmeyi kapatabilir ve daha sonra devam edebilirsiniz.",
  },
};
