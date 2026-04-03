export default function PropertyDetailPage({
  params,
}: {
  params: { id: string }
}) {
  return (
    <div>
      <h1 className="text-2xl font-bold">Property Detail</h1>
      {/* Tabbed interface: Overview, Bookings, Bills, Tasks, Inventory, Vault — to be built */}
    </div>
  )
}
