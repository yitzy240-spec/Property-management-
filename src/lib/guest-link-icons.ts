import { Link2, Play, FileText, Wifi, MapPin, Info, Trash2, Refrigerator, type LucideIcon } from 'lucide-react'
import type { GuestLinkIcon } from '@/types'

/**
 * Single source of truth for guest-link icons, shared by the property form
 * (icon picker) and the guest check-in page (rendering) so they never drift.
 * `option` carries an emoji hint for the native <select> dropdown.
 */
export const GUEST_LINK_ICONS: Record<GuestLinkIcon, { Icon: LucideIcon; label: string; option: string }> = {
  link: { Icon: Link2, label: 'Link', option: '🔗 Link' },
  video: { Icon: Play, label: 'Video', option: '▶ Video' },
  document: { Icon: FileText, label: 'Document / Guide', option: '📄 Document / Guide' },
  wifi: { Icon: Wifi, label: 'Wifi', option: '📶 Wifi' },
  location: { Icon: MapPin, label: 'Location / Map', option: '📍 Location / Map' },
  info: { Icon: Info, label: 'Info', option: 'ℹ️ Info' },
  trash: { Icon: Trash2, label: 'Trash / Garbage room', option: '🗑️ Trash / Garbage room' },
  appliance: { Icon: Refrigerator, label: 'Appliance / Kitchen', option: '🍽️ Appliance / Kitchen' },
}

/** Options for the icon picker dropdown, in display order. */
export const GUEST_LINK_ICON_OPTIONS = (Object.keys(GUEST_LINK_ICONS) as GuestLinkIcon[]).map((value) => ({
  value,
  label: GUEST_LINK_ICONS[value].option,
}))

/** Resolve a guest link's icon, falling back to the generic link icon. */
export function guestLinkIcon(icon?: GuestLinkIcon): LucideIcon {
  return (icon && GUEST_LINK_ICONS[icon]?.Icon) || Link2
}
