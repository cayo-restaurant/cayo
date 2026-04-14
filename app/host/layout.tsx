// RTL wrapper for the hostess dashboard — mirrors app/admin/layout.tsx
export default function HostLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <div dir="rtl">{children}</div>
}
