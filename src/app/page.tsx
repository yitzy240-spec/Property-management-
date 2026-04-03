import { redirect } from 'next/navigation'

export default function Home() {
  // Root redirects to admin dashboard (or login if not authenticated)
  redirect('/dashboard')
}
