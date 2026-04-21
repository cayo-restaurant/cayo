/**
 * סקריפט להוספת 3 הזמנות פיקטיביות להיום
 * הרץ עם: node add-test-reservations.mjs
 */

import crypto from 'crypto'

const SUPABASE_URL = 'https://hyxfuvqencillshgxjgi.supabase.co'
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh5eGZ1dnFlbmNpbGxzaGd4amdpIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjAzNzkxNywiZXhwIjoyMDkxNjEzOTE3fQ.cBvFVB0O4k0IhnQevnS5ioyL77iI0GUydCCJ69nwwK4'

const today = new Date().toISOString().split('T')[0]
const now = new Date().toISOString()

const reservations = [
  {
    id: crypto.randomUUID(),
    name: 'דניאל כהן',
    date: today,
    time: '12:00',
    area: 'table',
    guests: 2,
    phone: '0501234567',
    email: 'daniel@example.com',
    terms: true,
    status: 'confirmed',
    notes: 'הזמנה פיקטיבית לבדיקה',
    created_at: now,
    updated_at: now,
  },
  {
    id: crypto.randomUUID(),
    name: 'מיכל לוי',
    date: today,
    time: '12:30',
    area: 'table',
    guests: 4,
    phone: '0527654321',
    email: 'michal@example.com',
    terms: true,
    status: 'confirmed',
    notes: 'הזמנה פיקטיבית לבדיקה',
    created_at: now,
    updated_at: now,
  },
  {
    id: crypto.randomUUID(),
    name: 'יוסי אברהם',
    date: today,
    time: '13:00',
    area: 'bar',
    guests: 2,
    phone: '0539876543',
    email: 'yossi@example.com',
    terms: true,
    status: 'pending',
    notes: 'הזמנה פיקטיבית לבדיקה',
    created_at: now,
    updated_at: now,
  },
]

console.log(`\nמוסיף 3 הזמנות פיקטיביות לתאריך ${today}...\n`)

for (const r of reservations) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/reservations`, {
    method: 'POST',
    headers: {
      'apikey': SERVICE_KEY,
      'Authorization': `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation',
    },
    body: JSON.stringify(r),
  })

  if (res.ok) {
    const [row] = await res.json()
    console.log(`✅ נוצרה: ${row.name} | ${row.time} | ${row.area} | ${row.guests} סועדים | סטטוס: ${row.status}`)
  } else {
    const err = await res.text()
    console.error(`❌ שגיאה עבור ${r.name} (${r.time}): ${err}`)
  }
}

console.log('\nסיום!')
