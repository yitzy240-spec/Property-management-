import { createServiceClient } from "@/lib/supabase/service";
import { Button } from "@/components/ui/button";

// Helper: Calculate days until a date
function daysUntil(dateStr: string): number {
  const target = new Date(dateStr);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffMs = target.getTime() - today.getTime();
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}

// Helper: Format date as "Mon, day"
function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  const dayName = date.toLocaleDateString("en-US", { weekday: "short" });
  const day = date.getDate();
  return `${dayName}, ${day}`;
}

export const dynamic = "force-dynamic";

export default async function VisitsPage({
  searchParams,
}: {
  searchParams: { filter?: string };
}) {
  const supabase = createServiceClient();

  // Fetch property visit statuses
  const { data: properties } = await supabase
    .from("properties")
    .select(
      `
      id,
      name,
      occupancy_status,
      visit_due_date,
      checked_in_guest_name,
      checked_in_guest_checkout,
      admin_notes
    `
    )
    .order("name");

  // Apply filter if provided
  let filtered = properties || [];
  if (searchParams.filter) {
    filtered = filtered.filter((p) =>
      p.name.toLowerCase().includes(searchParams.filter.toLowerCase())
    );
  }

  // Categorize properties
  const thisWeek = filtered.filter((p) => {
    if (p.occupancy_status === "occupied") return false;
    const days = daysUntil(p.visit_due_date);
    return days >= 0 && days <= 7;
  });

  const later = filtered.filter((p) => {
    if (p.occupancy_status === "occupied") return false;
    const days = daysUntil(p.visit_due_date);
    return days > 7;
  });

  const occupied = filtered.filter((p) => p.occupancy_status === "occupied");

  // Helper: Render property row
  const PropertyRow = ({ property }: { property: (typeof filtered)[0] }) => {
    const days = daysUntil(property.visit_due_date);
    const isOverdue = days < 0;
    const isWarning = days >= 0 && days <= 3;

    return (
      <div
        key={property.id}
        className={`border-l-4 p-4 ${
          isOverdue
            ? "border-red-500 bg-red-50"
            : isWarning
              ? "border-amber-500 bg-amber-50"
              : "border-gray-300 bg-white"
        }`}
      >
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold">{property.name}</h3>
            {property.occupancy_status === "occupied" && (
              <p className="text-sm text-gray-600">
                Guest: {property.checked_in_guest_name} (checkout:{" "}
                {formatDate(property.checked_in_guest_checkout)})
              </p>
            )}
            {property.admin_notes && (
              <p className="text-sm text-gray-500 italic">{property.admin_notes}</p>
            )}
          </div>
          {property.occupancy_status !== "occupied" && (
            <Button
              size="sm"
              onClick={() =>
                (window.location.href = `/admin/visits/${property.id}/log`)
              }
            >
              Log Visit
            </Button>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6 p-6">
      <h1 className="text-3xl font-bold">Visits</h1>

      {/* This Week */}
      <section>
        <h2 className="mb-4 text-xl font-semibold">This Week</h2>
        <div className="space-y-2">
          {thisWeek.length > 0 ? (
            thisWeek.map((p) => <PropertyRow key={p.id} property={p} />)
          ) : (
            <p className="text-gray-500">No visits due this week</p>
          )}
        </div>
      </section>

      {/* Later */}
      <section>
        <h2 className="mb-4 text-xl font-semibold">Later</h2>
        <div className="space-y-2">
          {later.length > 0 ? (
            later.map((p) => <PropertyRow key={p.id} property={p} />)
          ) : (
            <p className="text-gray-500">No visits scheduled later</p>
          )}
        </div>
      </section>

      {/* Occupied */}
      <section>
        <h2 className="mb-4 text-xl font-semibold">Occupied</h2>
        <div className="space-y-2">
          {occupied.length > 0 ? (
            occupied.map((p) => <PropertyRow key={p.id} property={p} />)
          ) : (
            <p className="text-gray-500">No occupied properties</p>
          )}
        </div>
      </section>
    </div>
  );
}
