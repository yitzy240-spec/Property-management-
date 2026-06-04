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
})
