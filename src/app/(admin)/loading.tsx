import { LogoSpinner } from '@/components/ui/logo-spinner'

export default function AdminLoading() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <LogoSpinner size="md" text="Loading..." />
    </div>
  )
}
