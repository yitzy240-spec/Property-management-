import { redirect } from 'next/navigation'

export default function Home() {
  // Root redirects to login — owners land here by default
  redirect('/login')
}
