import { Resend } from 'resend'

interface ReservationEmail {
  email: string
  name: string
  date: string
  time: string
  guests: number
}

export async function sendConfirmation(reservation: ReservationEmail) {
  const resend = new Resend(process.env.RESEND_API_KEY)

  await resend.emails.send({
    from: 'noreply@cayobar.com',
    to: reservation.email,
    subject: `אישור הזמנה – ${reservation.date}`,
    html: `
      <div dir="rtl" style="font-family: sans-serif; max-width: 500px; margin: 0 auto; padding: 32px; background: #1A0A10; color: #F2E6D0; border-radius: 12px;">
        <h2 style="color: #C4784A; margin-bottom: 24px;">תודה ${reservation.name}!</h2>
        <p style="margin-bottom: 16px;">ההזמנה שלך נקלטה בהצלחה.</p>
        <div style="background: #4A0E1C; padding: 20px; border-radius: 8px; margin-bottom: 16px;">
          <p style="margin: 8px 0;"><strong>תאריך:</strong> ${reservation.date}</p>
          <p style="margin: 8px 0;"><strong>שעה:</strong> ${reservation.time}</p>
          <p style="margin: 8px 0;"><strong>מספר סועדים:</strong> ${reservation.guests}</p>
        </div>
        <p style="color: #C4784A;">נדאג לך לשולחן מוכן 🍷</p>
        <hr style="border: none; border-top: 1px solid #F2E6D033; margin: 24px 0;" />
        <p style="font-size: 12px; color: #F2E6D066;">CAYO | רחוב דיזנגוף 99, תל אביב | 03-1234567</p>
      </div>
    `,
  })
}
