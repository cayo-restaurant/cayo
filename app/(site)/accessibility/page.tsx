// Public accessibility-statement page (/accessibility).
// REQUIRED by Israeli law: תקנות שוויון זכויות לאנשים עם מוגבלות (התאמות נגישות
// לשירות), התשע״ג-2013 — תקנה 35א. Must be linked from every page footer.
//
// Hebrew, RTL.
//
// ⚠️ CRITICAL TODO before going live (do NOT publish without these):
//   - Real accessibility coordinator name + phone + email (currently placeholders)
//   - Verified physical address of the restaurant
//   - Confirm the WCAG conformance level you actually meet (this draft says
//     2.1 AA — partial conformance — which is the realistic claim for most
//     Next.js sites without dedicated a11y audit)
//   - Date the site was first audited (currently 15 באפריל 2026 = today)
//
// ⚠️ This page exposes the business name + coordinator contact to plaintiffs
// who specialize in accessibility lawsuits. Make sure the coordinator is real
// and answers the phone — that is the #1 way to defuse a complaint before it
// becomes a lawsuit.
//
// Marked clearly with [לאימות] inline so they're easy to grep.

export const metadata = {
  title: 'הצהרת נגישות | CAYO',
  description: 'הצהרת הנגישות של אתר ומסעדת CAYO',
}

export default function AccessibilityPage() {
  return (
    <main className="min-h-screen bg-white" dir="rtl">
      <article className="max-w-3xl mx-auto px-5 py-10 text-cayo-burgundy">
        <header className="mb-8 border-b-2 border-cayo-burgundy/15 pb-6">
          <h1 className="text-3xl font-black mb-2">הצהרת נגישות</h1>
          <p className="text-sm font-bold text-cayo-burgundy/60">
            אתר ומסעדת CAYO · עודכן לאחרונה: 15 באפריל 2026
          </p>
        </header>

        <Section n="1" title="מחויבות לנגישות">
          <p>
            מסעדת CAYO [ח.פ./ע.מ. לאימות] (להלן: <b>״המסעדה״</b>) רואה חשיבות עליונה
            במתן שירות שוויוני וזמין לאנשים עם מוגבלות, ופועלת להנגיש את האתר ואת השירות
            הפיזי במסעדה ככל שניתן, בהתאם לחוק שוויון זכויות לאנשים עם מוגבלות,
            התשנ״ח-1998 ולתקנות שוויון זכויות לאנשים עם מוגבלות (התאמות נגישות לשירות),
            התשע״ג-2013.
          </p>
        </Section>

        <Section n="2" title="נגישות האתר">
          <p>
            <b>2.1 רמת התאמה</b> — האתר עומד בהתאמה חלקית לדרישות תקן הנגישות הישראלי
            ת״י 5568, ברמת AA, המבוסס על קווי המנחים הבינלאומיים{' '}
            <span dir="ltr">WCAG 2.1 Level AA</span>.
          </p>
          <p>
            <b>2.2 התאמות שבוצעו באתר:</b>
          </p>
          <p>
            · ניווט מלא באמצעות מקלדת (Tab / Shift+Tab / Enter / Space).<br />
            · תיוג סמנטי של כל הכפתורים, השדות והאזורים (תגיות{' '}
            <span dir="ltr">aria-label</span> ו-<span dir="ltr">role</span> בכל מקום שנדרש).<br />
            · ניגודיות צבעים העומדת ביחס של לפחות 4.5:1 בטקסט הראשי.<br />
            · גופן ברור (Heebo) בגודל קריא, עם אפשרות הגדלה דרך הדפדפן.<br />
            · תמיכה מלאה בכיווניות RTL לעברית.<br />
            · טפסי הזמנה עם תוויות ברורות ופידבק שגיאות מילולי.<br />
            · תיאורים חלופיים (alt) לתמונות תוכן.<br />
            · ללא הבהובים, סרטוני וידאו אוטומטיים, או רכיבים נעים שעלולים לגרום
            למצוקה לאנשים עם רגישות אור או לקויות קוגניטיביות.
          </p>
          <p>
            <b>2.3 רכיבים שעדיין אינם נגישים במלואם:</b>
          </p>
          <p>
            · האתר נבדק ידנית — לא בוצעה ביקורת חיצונית פורמלית של מורשה נגישות.<br />
            · ייתכן שתוכן צד שלישי המוטמע באתר (מפת Google, סמל WhatsApp) אינו עומד
            במלוא דרישות הנגישות.<br />
            · פעולות מסוימות באזור הניהול (פאנל לעובדי המסעדה בלבד) לא נבדקו לנגישות
            מאחר שאינן מיועדות לציבור הרחב.
          </p>
          <p>
            <b>2.4</b> אנו מתחייבים להמשיך ולשפר את נגישות האתר, ולתקן ליקויים שיובאו
            לידיעתנו תוך פרק זמן סביר.
          </p>
        </Section>

        <Section n="3" title="נגישות פיזית במסעדה">
          <p>
            <b>3.1</b> המסעדה ממוקמת ברחוב דיזנגוף 99, תל אביב [לאימות].
          </p>
          <p>
            <b>3.2 סקירת הנגישות הפיזית:</b> [לאימות — נא לעדכן בהתאם למצב בפועל]
          </p>
          <p>
            · נגישות הכניסה למסעדה (מדרגות / רמפה / כניסה ישירה ממדרכה).<br />
            · רוחב מעברים בתוך המסעדה.<br />
            · קיומם של שירותי נכים מותאמים.<br />
            · אזור ישיבה נגיש.<br />
            · התאמות לאנשים עם לקויות שמיעה / ראייה (תפריט בכתב מוגדל, תאורה מספקת,
            צוות שעבר הדרכה).
          </p>
          <p>
            <b>3.3</b> במקרה של צורך מיוחד או בקשה להנגשה ספציפית, אנא צרו קשר מראש כדי
            שנוכל להתכונן באופן הטוב ביותר.
          </p>
        </Section>

        <Section n="4" title="רכז/ת נגישות">
          <p>
            לפי דין, מונה במסעדה רכז/ת נגישות, האחראי/ת על קבלת פניות, טיפול בתלונות,
            וקידום נושא הנגישות.
          </p>
          <p>
            <b>שם:</b> [שם רכז/ת הנגישות לאימות]
            <br />
            <b>טלפון:</b> [מספר טלפון לאימות]
            <br />
            <b>דוא״ל:</b> accessibility@cayobar.com [לאימות]
            <br />
            <b>שעות מענה:</b> ימים א׳-ה׳, 10:00–17:00
          </p>
        </Section>

        <Section n="5" title="הגשת בקשה או תלונה">
          <p>
            <b>5.1</b> נתקלת בקושי בשימוש באתר או בקבלת שירות במסעדה? אנא דווח/י לנו —
            אנחנו מתחייבים לבדוק כל פנייה ולחזור עם מענה.
          </p>
          <p>
            <b>5.2</b> בעת פנייה אנא צרף/י, ככל הניתן:
          </p>
          <p>
            · תיאור הבעיה ומקום ההיתקלות (כתובת העמוד באתר / מקום במסעדה).<br />
            · סוג ההתאמה הנדרשת.<br />
            · פרטי קשר לחזרה אליך (טלפון או דוא״ל).<br />
            · אם רלוונטי — צילום מסך או צילום של המקום.
          </p>
          <p>
            <b>5.3 זמן תגובה</b> — נשתדל להשיב לפנייתך תוך 7 ימי עבודה. במידה ויידרש
            תיקון מורכב, נעדכן בלוח זמנים צפוי לתיקון.
          </p>
        </Section>

        <Section n="6" title="פנייה לנציבות שוויון זכויות לאנשים עם מוגבלות">
          <p>
            במקרה שלא נענית או שלא קיבלת מענה מספק, ניתן לפנות לנציבות שוויון זכויות
            לאנשים עם מוגבלות במשרד המשפטים:
          </p>
          <p>
            <b>אתר:</b> www.gov.il/he/departments/commission_for_equal_rights_of_persons_with_disabilities
            <br />
            <b>טלפון:</b> 1-800-883-882
            <br />
            <b>דוא״ל:</b> Mugbaluyot@justice.gov.il
          </p>
        </Section>

        <Section n="7" title="עדכון ההצהרה">
          <p>
            הצהרה זו תיבחן ותעודכן מעת לעת, בהתאם לשינויים באתר, בשירות הפיזי או
            בדרישות הדין. תאריך העדכון האחרון מופיע בראש העמוד.
          </p>
        </Section>

        <footer className="mt-10 pt-6 border-t border-cayo-burgundy/15 text-xs text-cayo-burgundy/50">
          מסמך זה נוסח על בסיס הדין הישראלי. הוא אינו מהווה ייעוץ משפטי. מומלץ להתייעץ
          עם מורשה נגישות שירות לפני הסתמכות מלאה עליו.
        </footer>
      </article>
    </main>
  )
}

function Section({ n, title, children }: { n: string; title: string; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      <h2 className="text-xl font-black mb-3">
        {n}. {title}
      </h2>
      <div className="space-y-3 text-[15px] leading-relaxed text-cayo-burgundy/85">
        {children}
      </div>
    </section>
  )
}
