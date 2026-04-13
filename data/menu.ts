export interface MenuItem {
  name: string
  description: string
  price: number
}

export interface MenuCategory {
  name: string
  items: MenuItem[]
}

export const menu: MenuCategory[] = [
  {
    name: 'ראשונות',
    items: [
      { name: 'סביצ\'ה דג ים', description: 'דג ים טרי, לימון, כוסברה, צ\'ילי ובצל סגול', price: 58 },
      { name: 'טוסטונס', description: 'פלנטיין ירוק מטוגן, גוואקמולי ושמנת חמוצה', price: 42 },
      { name: 'אמפנדס בשר', description: 'כיסוני בצק פריכים ממולאים בשר בקר ותבלינים קובניים', price: 48 },
      { name: 'קרפצ\'יו פטריות', description: 'פטריות יער, שמן כמהין, פרמזן ועלי רוקט', price: 52 },
      { name: 'ברואטה בורטה', description: 'גבינת בורטה, עגבניות צלויות, בזיליקום ושמן זית', price: 56 },
    ],
  },
  {
    name: 'עיקריות',
    items: [
      { name: 'רופה ויאחה', description: 'תבשיל בשר קובני קלאסי עם אורז, שעועית שחורה ופלנטיין', price: 98 },
      { name: 'סטייק אנטריקוט', description: 'אנטריקוט 300 גרם, צ\'ימיצ\'ורי, צ\'יפס בטטה', price: 148 },
      { name: 'דג ברמונדי', description: 'פילה ברמונדי צלוי, סלט מנגו, אורז קוקוס', price: 118 },
      { name: 'חזה עוף קריולי', description: 'חזה עוף בתיבול קריולי, פירה בטטה ירקות צלויים', price: 88 },
      { name: 'המבורגר CAYO', description: '200 גרם בקר, גבינת צ\'דר, בצל מקורמל, רוטב ביתי', price: 78 },
    ],
  },
  {
    name: 'קינוחים',
    items: [
      { name: 'פלאן קרמל', description: 'פלאן קובני קלאסי עם קרמל מלוח', price: 42 },
      { name: 'צ\'ורוס', description: 'צ\'ורוס טריים עם רוטב שוקולד ודולסה דה לצ\'ה', price: 38 },
      { name: 'סורבה טרופי', description: 'סורבה מנגו-פסיפלורה עם פירות טריים', price: 36 },
      { name: 'עוגת שוקולד חמה', description: 'עוגת שוקולד עם לב נוזלי וגלידת וניל', price: 48 },
    ],
  },
  {
    name: 'משקאות',
    items: [
      { name: 'מוחיטו קלאסי', description: 'רום לבן, ליים, נענע, סודה', price: 48 },
      { name: 'דייקירי מנגו', description: 'רום, מנגו טרי, ליים', price: 52 },
      { name: 'קובה ליברה', description: 'רום זהוב, קולה, ליים', price: 44 },
      { name: 'לימונדה טרופית', description: 'לימון, פסיפלורה, נענע וסודה', price: 28 },
      { name: 'קפה קובני', description: 'אספרסו כפול בסגנון קובני עם סוכר חום', price: 14 },
    ],
  },
]
