export default function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="flex min-h-screen">
      {/* Sidebar navigation — to be built */}
      <aside className="hidden w-64 border-r bg-white lg:block">
        <div className="flex h-16 items-center border-b px-6">
          <h1 className="text-lg font-bold text-brand-700">ApartmentOS</h1>
        </div>
        <nav className="p-4">
          {/* Navigation links will go here */}
        </nav>
      </aside>

      {/* Main content area */}
      <main className="flex-1">
        {/* Mobile header — to be built */}
        <header className="flex h-16 items-center border-b bg-white px-6 lg:hidden">
          <h1 className="text-lg font-bold text-brand-700">ApartmentOS</h1>
        </header>
        <div className="p-4 lg:p-8">
          {children}
        </div>
      </main>
    </div>
  )
}
