import { LogoSpinner } from '@/components/ui/logo-spinner'

export default function RootLoading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#FAFAFA]">
      <LogoSpinner size="lg" text="Loading..." />
    </div>
  )
}
