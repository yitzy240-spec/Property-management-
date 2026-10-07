import { describe, it, expect } from 'vitest'
import { parseLabelMapping, labelsForProperty, setLabelsForProperty } from './gmail-label-mapping'

describe('gmail label mapping', () => {
  const base = { 'Bills/Agripas 6': 'p1', 'Bills/Savyon': 'p2', 'Bills/Agripas 6 water': 'p1' }

  it('parses stored JSON and tolerates junk', () => {
    expect(parseLabelMapping(JSON.stringify(base))).toEqual(base)
    expect(parseLabelMapping(null)).toEqual({})
    expect(parseLabelMapping('not json')).toEqual({})
    expect(parseLabelMapping('[1,2]')).toEqual({})
  })

  it('lists the labels routed to one property', () => {
    expect(labelsForProperty(base, 'p1')).toEqual(['Bills/Agripas 6', 'Bills/Agripas 6 water'])
    expect(labelsForProperty(base, 'p3')).toEqual([])
  })

  it('adds a label for a new property without touching others', () => {
    const { mapping, conflicts } = setLabelsForProperty(base, 'p3', ['Bills/Mesila'])
    expect(conflicts).toEqual([])
    expect(mapping).toEqual({ ...base, 'Bills/Mesila': 'p3' })
  })

  it('replaces (and can remove) a property\'s labels', () => {
    const { mapping } = setLabelsForProperty(base, 'p1', ['Bills/Agripas 6 '])
    expect(mapping).toEqual({ 'Bills/Agripas 6': 'p1', 'Bills/Savyon': 'p2' })
    expect(setLabelsForProperty(base, 'p1', []).mapping).toEqual({ 'Bills/Savyon': 'p2' })
  })

  it('refuses to steal a label that belongs to another property', () => {
    const { mapping, conflicts } = setLabelsForProperty(base, 'p1', ['Bills/Savyon'])
    expect(conflicts).toEqual(['Bills/Savyon'])
    expect(mapping['Bills/Savyon']).toBe('p2')
  })
})
