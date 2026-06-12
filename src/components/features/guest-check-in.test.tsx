/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { GuestCheckIn } from './guest-check-in'

const baseProperty = {
  name: 'Agripas 8',
  address: '8 Agripas',
  neighborhood: 'Center',
  city: 'Jerusalem',
  entry_code: '1234',
  building_entry_code: '8889',
  youtube_tutorial_url: 'https://youtu.be/abc',
  canva_design_url: 'https://www.canva.com/design/DAGmTDKfFrI/view',
  entry_instructions: null,
  guest_links: [],
}

describe('GuestCheckIn', () => {
  it('embeds the Canva guide via an iframe when canvaEmbedUrl is provided', () => {
    render(
      <GuestCheckIn
        property={baseProperty}
        booking={null}
        canvaEmbedUrl="https://www.canva.com/design/DAGmTDKfFrI/view?embed"
      />,
    )
    const iframe = screen.getByTitle('Agripas 8 Guide')
    expect(iframe.getAttribute('src')).toBe('https://www.canva.com/design/DAGmTDKfFrI/view?embed')
  })

  it('labels the video as the entry video, not "Apartment Video Guide"', () => {
    render(<GuestCheckIn property={baseProperty} booking={null} canvaEmbedUrl={null} />)
    expect(screen.getByText('Entry Video Guide')).toBeTruthy()
    expect(screen.queryByText('Apartment Video Guide')).toBeNull()
  })

  it('falls back to explicit entry instructions when there is no embedded guide', () => {
    render(<GuestCheckIn property={baseProperty} booking={null} canvaEmbedUrl={null} />)
    expect(
      screen.getByText('Use the building code at the main entrance, then the door code on the Simplex lock.'),
    ).toBeTruthy()
  })

  it('shows the apartment-specific entry instructions when present', () => {
    render(
      <GuestCheckIn
        property={{ ...baseProperty, entry_instructions: 'Take the lift to 3, turn right.' }}
        booking={null}
        canvaEmbedUrl={null}
      />,
    )
    expect(screen.getByText('Take the lift to 3, turn right.')).toBeTruthy()
  })

  it('hides the entry video until the code is revealed (it shows the door code)', () => {
    const { rerender } = render(
      <GuestCheckIn property={{ ...baseProperty, entry_code: null }} booking={null} canvaEmbedUrl={null} />,
    )
    expect(screen.queryByText('Entry Video Guide')).toBeNull()
    rerender(<GuestCheckIn property={baseProperty} booking={null} canvaEmbedUrl={null} />)
    expect(screen.getByText('Entry Video Guide')).toBeTruthy()
  })

  it('renders an always-visible guest link even before the code is revealed', () => {
    render(
      <GuestCheckIn
        property={{
          ...baseProperty,
          entry_code: null,
          guest_links: [{ label: 'Wifi & appliances', url: 'https://ex.com/wifi', hide_until_revealed: false }],
        }}
        booking={null}
        canvaEmbedUrl={null}
      />,
    )
    expect(screen.getByText('Wifi & appliances')).toBeTruthy()
  })

  it('hides a gated guest link until the code is revealed', () => {
    const gated = { label: 'Door video', url: 'https://ex.com/door', hide_until_revealed: true }
    const { rerender } = render(
      <GuestCheckIn property={{ ...baseProperty, entry_code: null, guest_links: [gated] }} booking={null} canvaEmbedUrl={null} />,
    )
    expect(screen.queryByText('Door video')).toBeNull()
    rerender(<GuestCheckIn property={{ ...baseProperty, guest_links: [gated] }} booking={null} canvaEmbedUrl={null} />)
    expect(screen.getByText('Door video')).toBeTruthy()
  })
})
